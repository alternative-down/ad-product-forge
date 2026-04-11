import { type ReactNode, useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleHelp } from 'lucide-react';

import { AdminButton, AdminInput, AdminLoadingState, AdminTextarea, PageHeader } from '@/components/admin';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getSystemLlm, getSystemSettings, updateLlmDefaults, upsertSystemSettings } from '@/lib/admin-api';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';

import { ProfileDefaultsSection } from '../integrations/-profile-defaults-section';

export const Route = createFileRoute('/settings/')({
  component: SettingsGeneralRoute,
});

function SettingsGeneralRoute() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['admin', 'system-settings'],
    queryFn: getSystemSettings,
  });
  const llmQuery = useQuery({
    queryKey: ['admin', 'system-llm'],
    queryFn: getSystemLlm,
  });
  const [companyDraft, setCompanyDraft] = useState<{
    companyName: string;
    companyContext: string;
  } | null>(null);
  const [operationsDraft, setOperationsDraft] = useState<{
    stepDelayEnabled: boolean;
    communicationDmFlushingEnabled: boolean;
    communicationGroupFlushingEnabled: boolean;
  } | null>(null);
  const [runtimeDraft, setRuntimeDraft] = useState<{
    memoryLastMessagesFullEnabled: boolean;
    memoryLastMessagesCount: string;
    tokenCountFilterEnabled: boolean;
    tokenCountFilterLimit: string;
    omObservationMessageTokens: string;
    omObservationBufferTokens: string;
    omObservationBufferActivation: string;
    omObservationPreviousObserverTokens: string;
    omReflectionObservationTokens: string;
    omReflectionBufferActivation: string;
  } | null>(null);
  const [defaultsDraft, setDefaultsDraft] = useState<{
    primaryProfileId: string;
    omProfileId: string;
    hiringRhProfileId: string;
  } | null>(null);
  const settingsMutation = useMutation({
    mutationFn: upsertSystemSettings,
    onMutate: () => startAdminAction('Salvando configurações...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Configurações atualizadas.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-settings'] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const defaultsMutation = useMutation({
    mutationFn: updateLlmDefaults,
    onMutate: () => startAdminAction('Salvando perfis padrão...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Perfis padrão atualizados.');
      setDefaultsDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-llm'] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });

  const companySettings = companyDraft ?? (settingsQuery.data
    ? {
        companyName: settingsQuery.data.companyName,
        companyContext: settingsQuery.data.companyContext,
      }
    : null);
  const operationsSettings = operationsDraft ?? (settingsQuery.data
    ? {
        stepDelayEnabled: settingsQuery.data.stepDelayEnabled,
        communicationDmFlushingEnabled: settingsQuery.data.communicationDmFlushingEnabled,
        communicationGroupFlushingEnabled: settingsQuery.data.communicationGroupFlushingEnabled,
      }
    : null);
  const runtimeSettings = runtimeDraft ?? (settingsQuery.data
    ? {
        memoryLastMessagesFullEnabled: settingsQuery.data.memoryLastMessagesFullEnabled,
        memoryLastMessagesCount: String(settingsQuery.data.memoryLastMessagesCount),
        tokenCountFilterEnabled: settingsQuery.data.tokenCountFilterEnabled,
        tokenCountFilterLimit: String(settingsQuery.data.tokenCountFilterLimit),
        omObservationMessageTokens: String(settingsQuery.data.omObservationMessageTokens),
        omObservationBufferTokens: String(settingsQuery.data.omObservationBufferTokens),
        omObservationBufferActivation: String(settingsQuery.data.omObservationBufferActivation),
        omObservationPreviousObserverTokens: String(settingsQuery.data.omObservationPreviousObserverTokens),
        omReflectionObservationTokens: String(settingsQuery.data.omReflectionObservationTokens),
        omReflectionBufferActivation: String(settingsQuery.data.omReflectionBufferActivation),
      }
    : null);

  const enabledProfiles = useMemo(
    () => (llmQuery.data?.profiles ?? []).filter((profile) => profile.isEnabled),
    [llmQuery.data?.profiles],
  );
  const primaryProfileId = defaultsDraft?.primaryProfileId ?? llmQuery.data?.defaults?.primaryProfileId ?? '';
  const omProfileId = defaultsDraft?.omProfileId ?? llmQuery.data?.defaults?.omProfileId ?? '';
  const hiringRhProfileId = defaultsDraft?.hiringRhProfileId ?? llmQuery.data?.defaults?.hiringRhProfileId ?? '';
  const primaryProfileName = enabledProfiles.find((profile) => profile.profileId === primaryProfileId)?.name;
  const omProfileName = enabledProfiles.find((profile) => profile.profileId === omProfileId)?.name;
  const hiringRhProfileName = enabledProfiles.find((profile) => profile.profileId === hiringRhProfileId)?.name;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader
        title="Geral"
        description="Ajuste a identidade da empresa, o comportamento global do runtime e os perfis padrão do sistema."
      />

      {settingsQuery.isLoading && !settingsQuery.data ? <AdminLoadingState label="Carregando configurações..." /> : null}

      {companySettings ? (
        <section className="space-y-5">
          <div className="space-y-1">
            <div className="text-lg font-semibold tracking-[-0.03em]">Empresa</div>
          </div>

          <form
            className="max-w-3xl space-y-5"
            onSubmit={(event) => {
              event.preventDefault();

              if (!settingsQuery.data) {
                return;
              }

              settingsMutation.mutate({
                ...settingsQuery.data,
                companyName: companySettings.companyName.trim(),
                companyContext: companySettings.companyContext.trim(),
              });
            }}
          >
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="settings-company-name">Nome</label>
              <AdminInput
                id="settings-company-name"
                value={companySettings.companyName}
                onChange={(event) =>
                  setCompanyDraft((current) => ({
                    companyName: event.target.value,
                    companyContext: current?.companyContext ?? settingsQuery.data?.companyContext ?? '',
                  }))
                }
                disabled={settingsMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="settings-company-context">Descrição</label>
              <AdminTextarea
                id="settings-company-context"
                rows={8}
                value={companySettings.companyContext}
                onChange={(event) =>
                  setCompanyDraft((current) => ({
                    companyName: current?.companyName ?? settingsQuery.data?.companyName ?? '',
                    companyContext: event.target.value,
                  }))
                }
                disabled={settingsMutation.isPending}
              />
            </div>
            {settingsQuery.error ? <div className="text-sm text-destructive">{settingsQuery.error.message}</div> : null}
            {settingsMutation.error ? <div className="text-sm text-destructive">{settingsMutation.error.message}</div> : null}
            <div className="flex justify-end">
              <AdminButton type="submit" disabled={settingsMutation.isPending}>
                {settingsMutation.isPending ? 'Salvando...' : 'Salvar empresa'}
              </AdminButton>
            </div>
          </form>
        </section>
      ) : null}

      {operationsSettings ? (
        <section className="space-y-5 border-t border-border pt-6">
          <div className="space-y-1">
            <div className="text-lg font-semibold tracking-[-0.03em]">Operação</div>
          </div>

          <form
            className="max-w-3xl space-y-3"
            onSubmit={(event) => {
              event.preventDefault();

              if (!settingsQuery.data) {
                return;
              }

              settingsMutation.mutate({
                ...settingsQuery.data,
                stepDelayEnabled: operationsSettings.stepDelayEnabled,
                communicationDmFlushingEnabled: operationsSettings.communicationDmFlushingEnabled,
                communicationGroupFlushingEnabled: operationsSettings.communicationGroupFlushingEnabled,
              });
            }}
          >
            <OperationSwitchField
              label="Delay entre steps"
              description="Ativa o intervalo padrão entre execuções do runner."
              checked={operationsSettings.stepDelayEnabled}
              disabled={settingsMutation.isPending}
              onCheckedChange={(checked) =>
                setOperationsDraft((current) => ({
                  stepDelayEnabled: checked,
                  communicationDmFlushingEnabled:
                    current?.communicationDmFlushingEnabled ?? settingsQuery.data?.communicationDmFlushingEnabled ?? true,
                  communicationGroupFlushingEnabled:
                    current?.communicationGroupFlushingEnabled ?? settingsQuery.data?.communicationGroupFlushingEnabled ?? true,
                }))
              }
            />
            <OperationSwitchField
              label="Flushing de mensagens diretas"
              description="Controla se mensagens DM dos providers acordam agentes automaticamente."
              checked={operationsSettings.communicationDmFlushingEnabled}
              disabled={settingsMutation.isPending}
              onCheckedChange={(checked) =>
                setOperationsDraft((current) => ({
                  stepDelayEnabled: current?.stepDelayEnabled ?? settingsQuery.data?.stepDelayEnabled ?? true,
                  communicationDmFlushingEnabled: checked,
                  communicationGroupFlushingEnabled:
                    current?.communicationGroupFlushingEnabled ?? settingsQuery.data?.communicationGroupFlushingEnabled ?? true,
                }))
              }
            />
            <OperationSwitchField
              label="Flushing de mensagens em grupo"
              description="Controla se mensagens de grupo dos providers acordam agentes automaticamente."
              checked={operationsSettings.communicationGroupFlushingEnabled}
              disabled={settingsMutation.isPending}
              onCheckedChange={(checked) =>
                setOperationsDraft((current) => ({
                  stepDelayEnabled: current?.stepDelayEnabled ?? settingsQuery.data?.stepDelayEnabled ?? true,
                  communicationDmFlushingEnabled:
                    current?.communicationDmFlushingEnabled ?? settingsQuery.data?.communicationDmFlushingEnabled ?? true,
                  communicationGroupFlushingEnabled: checked,
                }))
              }
            />
            <div className="flex justify-end">
              <AdminButton type="submit" disabled={settingsMutation.isPending}>
                {settingsMutation.isPending ? 'Salvando...' : 'Salvar operação'}
              </AdminButton>
            </div>
          </form>
        </section>
      ) : null}

      {runtimeSettings ? (
        <section className="space-y-5 border-t border-border pt-6">
          <div className="space-y-1">
            <div className="text-lg font-semibold tracking-[-0.03em]">Memória e contexto</div>
            <div className="max-w-3xl text-sm text-muted-foreground">
              Ajusta `lastMessages`, token limiter e OM. Aqui você controla o tamanho do contexto recente, o freio de tokens e a cadência de observação e reflexão.
            </div>
          </div>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();

              if (!settingsQuery.data) {
                return;
              }

              settingsMutation.mutate({
                ...settingsQuery.data,
                memoryLastMessagesFullEnabled: runtimeSettings.memoryLastMessagesFullEnabled,
                memoryLastMessagesCount: Number(runtimeSettings.memoryLastMessagesCount),
                tokenCountFilterEnabled: runtimeSettings.tokenCountFilterEnabled,
                tokenCountFilterLimit: Number(runtimeSettings.tokenCountFilterLimit),
                omObservationMessageTokens: Number(runtimeSettings.omObservationMessageTokens),
                omObservationBufferTokens: Number(runtimeSettings.omObservationBufferTokens),
                omObservationBufferActivation: Number(runtimeSettings.omObservationBufferActivation),
                omObservationPreviousObserverTokens: Number(runtimeSettings.omObservationPreviousObserverTokens),
                omReflectionObservationTokens: Number(runtimeSettings.omReflectionObservationTokens),
                omReflectionBufferActivation: Number(runtimeSettings.omReflectionBufferActivation),
              });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <RuntimeSettingField
                label="Last messages full load"
                description="Carrega o histórico inteiro da thread a cada generate. Útil para preservar continuidade máxima, mas aumenta custo e peso de contexto."
                tooltip="Liga carga completa do histórico e ignora o limite numérico abaixo."
              >
                <Switch
                  checked={runtimeSettings.memoryLastMessagesFullEnabled}
                  disabled={settingsMutation.isPending}
                  onCheckedChange={(checked) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      memoryLastMessagesFullEnabled: checked,
                    })
                  }
                />
              </RuntimeSettingField>
              <RuntimeSettingField
                label="Last messages count"
                description="Janela base de mensagens recentes que entra no modelo quando o full load está desligado. Valor maior preserva mais contexto; valor menor reduz custo e ruído."
                tooltip="Na prática é o tamanho inicial da janela recente da thread."
              >
                <AdminInput
                  type="number"
                  value={runtimeSettings.memoryLastMessagesCount}
                  onChange={(event) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      memoryLastMessagesCount: event.target.value,
                    })
                  }
                  disabled={settingsMutation.isPending || runtimeSettings.memoryLastMessagesFullEnabled}
                />
              </RuntimeSettingField>
              <RuntimeSettingField
                label="Token count filter"
                description="Liga o filtro que corta contexto antes do generate quando a entrada fica grande demais. É a proteção mais direta contra prompts inchados."
                tooltip="Sem esse filtro o modelo recebe o contexto bruto montado pelo runtime."
              >
                <Switch
                  checked={runtimeSettings.tokenCountFilterEnabled}
                  disabled={settingsMutation.isPending}
                  onCheckedChange={(checked) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      tokenCountFilterEnabled: checked,
                    })
                  }
                />
              </RuntimeSettingField>
              <RuntimeSettingField
                label="Token count limit"
                description="Teto aproximado de tokens permitido para a entrada depois da montagem de contexto. Use como freio global para evitar steps muito pesadas."
                tooltip="Quanto menor, mais agressivo o corte do contexto; quanto maior, mais contexto entra no generate."
              >
                <AdminInput
                  type="number"
                  value={runtimeSettings.tokenCountFilterLimit}
                  onChange={(event) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      tokenCountFilterLimit: event.target.value,
                    })
                  }
                  disabled={settingsMutation.isPending || !runtimeSettings.tokenCountFilterEnabled}
                />
              </RuntimeSettingField>
              <RuntimeSettingField
                label="OM observation message tokens"
                description="Volume de mensagens acumuladas na thread antes do observer gerar novas observations. Aumentar reduz frequência; diminuir faz o observer rodar mais cedo e mais vezes."
                tooltip="É o limiar principal da etapa de observação."
              >
                <AdminInput
                  type="number"
                  value={runtimeSettings.omObservationMessageTokens}
                  onChange={(event) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      omObservationMessageTokens: event.target.value,
                    })
                  }
                  disabled={settingsMutation.isPending}
                />
              </RuntimeSettingField>
              <RuntimeSettingField
                label="OM observation buffer tokens"
                description="Tamanho do buffer incremental de observação. Em razão, `0.2` significa cerca de 20% do limiar de observation. Menor tende a processar em lotes menores; maior acumula mais antes de reagir."
                tooltip="Controla o tamanho dos blocos usados pelo buffering assíncrono do observer."
              >
                <AdminInput
                  type="number"
                  step="0.01"
                  value={runtimeSettings.omObservationBufferTokens}
                  onChange={(event) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      omObservationBufferTokens: event.target.value,
                    })
                  }
                  disabled={settingsMutation.isPending}
                />
              </RuntimeSettingField>
              <RuntimeSettingField
                label="OM observation buffer activation"
                description="Ponto em que o buffer de observação começa a atuar em relação ao limiar principal. `0.8` significa ativar perto de 80% do limite de observation."
                tooltip="Valores menores ativam mais cedo; valores maiores esperam mais contexto acumular."
              >
                <AdminInput
                  type="number"
                  step="0.01"
                  value={runtimeSettings.omObservationBufferActivation}
                  onChange={(event) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      omObservationBufferActivation: event.target.value,
                    })
                  }
                  disabled={settingsMutation.isPending}
                />
              </RuntimeSettingField>
              <RuntimeSettingField
                label="OM previous observer tokens"
                description="Quanto do histórico de observations anteriores volta para o observer como contexto. Menor economiza tokens; maior preserva mais continuidade do que já foi observado."
                tooltip="Se subir demais, o observer fica mais caro; se cair demais, ele perde continuidade."
              >
                <AdminInput
                  type="number"
                  value={runtimeSettings.omObservationPreviousObserverTokens}
                  onChange={(event) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      omObservationPreviousObserverTokens: event.target.value,
                    })
                  }
                  disabled={settingsMutation.isPending}
                />
              </RuntimeSettingField>
              <RuntimeSettingField
                label="OM reflection observation tokens"
                description="Quantidade de material observado necessária antes da fase de reflection consolidar padrões mais altos. Menor faz refletir mais cedo; maior espera mais evidência antes de sintetizar."
                tooltip="É o limiar principal da etapa de reflexão."
              >
                <AdminInput
                  type="number"
                  value={runtimeSettings.omReflectionObservationTokens}
                  onChange={(event) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      omReflectionObservationTokens: event.target.value,
                    })
                  }
                  disabled={settingsMutation.isPending}
                />
              </RuntimeSettingField>
              <RuntimeSettingField
                label="OM reflection buffer activation"
                description="Ponto relativo em que a reflection começa a preparar consolidação antes de atingir o limiar total. `0.5` significa começar perto da metade do threshold de reflection."
                tooltip="Baixar acelera reflexões; subir deixa a reflexão mais conservadora."
              >
                <AdminInput
                  type="number"
                  step="0.01"
                  value={runtimeSettings.omReflectionBufferActivation}
                  onChange={(event) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      omReflectionBufferActivation: event.target.value,
                    })
                  }
                  disabled={settingsMutation.isPending}
                />
              </RuntimeSettingField>
            </div>
            <div className="flex justify-end">
              <AdminButton type="submit" disabled={settingsMutation.isPending}>
                {settingsMutation.isPending ? 'Salvando...' : 'Salvar memória e OM'}
              </AdminButton>
            </div>
          </form>
        </section>
      ) : null}

      <section className="border-t border-border pt-6">
        <ProfileDefaultsSection
          enabledProfiles={enabledProfiles}
          primaryProfileId={primaryProfileId}
          omProfileId={omProfileId}
          hiringRhProfileId={hiringRhProfileId}
          primaryProfileName={primaryProfileName}
          omProfileName={omProfileName}
          hiringRhProfileName={hiringRhProfileName}
          loading={llmQuery.isLoading}
          pending={defaultsMutation.isPending}
          errorMessage={defaultsMutation.error?.message ?? llmQuery.error?.message}
          onPrimaryProfileChange={(value) =>
            setDefaultsDraft((current) => ({
              primaryProfileId: value,
              omProfileId: current?.omProfileId ?? llmQuery.data?.defaults?.omProfileId ?? '',
              hiringRhProfileId: current?.hiringRhProfileId ?? llmQuery.data?.defaults?.hiringRhProfileId ?? '',
            }))
          }
          onOmProfileChange={(value) =>
            setDefaultsDraft((current) => ({
              primaryProfileId: current?.primaryProfileId ?? llmQuery.data?.defaults?.primaryProfileId ?? '',
              omProfileId: value,
              hiringRhProfileId: current?.hiringRhProfileId ?? llmQuery.data?.defaults?.hiringRhProfileId ?? '',
            }))
          }
          onHiringRhProfileChange={(value) =>
            setDefaultsDraft((current) => ({
              primaryProfileId: current?.primaryProfileId ?? llmQuery.data?.defaults?.primaryProfileId ?? '',
              omProfileId: current?.omProfileId ?? llmQuery.data?.defaults?.omProfileId ?? '',
              hiringRhProfileId: value,
            }))
          }
          onSubmit={() =>
            defaultsMutation.mutate({
              primaryProfileId,
              omProfileId,
              hiringRhProfileId,
            })
          }
        />
      </section>
    </div>
  );
}

function OperationSwitchField(input: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange(value: boolean): void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-sm border border-border px-4 py-3">
      <div className="space-y-1">
        <div className="text-sm font-medium">{input.label}</div>
        <div className="text-sm text-muted-foreground">{input.description}</div>
      </div>
      <Switch checked={input.checked} disabled={input.disabled} onCheckedChange={input.onCheckedChange} />
    </div>
  );
}

function RuntimeSettingField(input: {
  label: string;
  description: string;
  tooltip?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">{input.label}</label>
        {input.tooltip ? (
          <Tooltip>
            <TooltipTrigger>
              <span className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground">
                <CircleHelp className="h-4 w-4" />
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-72 text-xs leading-relaxed">
              {input.tooltip}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <div className="text-xs leading-relaxed text-muted-foreground">{input.description}</div>
      {input.children}
    </div>
  );
}
