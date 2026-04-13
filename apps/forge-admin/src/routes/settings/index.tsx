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
    checkpointedOmEnabled: boolean;
    checkpointedOmTotalContextTokens: string;
    checkpointedOmRecentRawTokens: string;
    checkpointedOmRawObservationBatchTokens: string;
    checkpointedOmObservationReflectionBatchTokens: string;
    checkpointedOmObservationSupportTokens: string;
    checkpointedOmReflectionSupportTokens: string;
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
        checkpointedOmEnabled: settingsQuery.data.checkpointedOmEnabled,
        checkpointedOmTotalContextTokens: String(settingsQuery.data.checkpointedOmTotalContextTokens),
        checkpointedOmRecentRawTokens: String(settingsQuery.data.checkpointedOmRecentRawTokens),
        checkpointedOmRawObservationBatchTokens: String(settingsQuery.data.checkpointedOmRawObservationBatchTokens),
        checkpointedOmObservationReflectionBatchTokens: String(settingsQuery.data.checkpointedOmObservationReflectionBatchTokens),
        checkpointedOmObservationSupportTokens: String(settingsQuery.data.checkpointedOmObservationSupportTokens),
        checkpointedOmReflectionSupportTokens: String(settingsQuery.data.checkpointedOmReflectionSupportTokens),
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
              Ajusta `lastMessages`, token limiter e a OM checkpointed. Aqui você controla o tamanho do contexto recente, o freio de tokens e a compressão ativa por camadas.
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
                checkpointedOmEnabled: runtimeSettings.checkpointedOmEnabled,
                checkpointedOmTotalContextTokens: Number(runtimeSettings.checkpointedOmTotalContextTokens),
                checkpointedOmRecentRawTokens: Number(runtimeSettings.checkpointedOmRecentRawTokens),
                checkpointedOmRawObservationBatchTokens: Number(runtimeSettings.checkpointedOmRawObservationBatchTokens),
                checkpointedOmObservationReflectionBatchTokens:
                  Number(runtimeSettings.checkpointedOmObservationReflectionBatchTokens),
                checkpointedOmObservationSupportTokens:
                  Number(runtimeSettings.checkpointedOmObservationSupportTokens),
                checkpointedOmReflectionSupportTokens:
                  Number(runtimeSettings.checkpointedOmReflectionSupportTokens),
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
                label="Checkpointed OM"
                description="Liga a OM nova com checkpoint, batches de observation/reflection e montagem própria do contexto ativo."
                tooltip="Quando desligada, o runtime usa só histórico recente e token limiter."
              >
                <Switch
                  checked={runtimeSettings.checkpointedOmEnabled}
                  disabled={settingsMutation.isPending}
                  onCheckedChange={(checked) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      checkpointedOmEnabled: checked,
                    })
                  }
                />
              </RuntimeSettingField>
              <RuntimeSettingField
                label="OM total context tokens"
                description="Orçamento total da OM para reflections + observations + raw recente. O flush atual continua fora desse valor."
                tooltip="A OM usa esse teto para decidir quanto espaço sobra para a camada histórica de reflections."
              >
                <AdminInput
                  type="number"
                  value={runtimeSettings.checkpointedOmTotalContextTokens}
                  onChange={(event) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      checkpointedOmTotalContextTokens: event.target.value,
                    })
                  }
                  disabled={settingsMutation.isPending || !runtimeSettings.checkpointedOmEnabled}
                />
              </RuntimeSettingField>
              <RuntimeSettingField
                label="OM recent raw tokens"
                description="Reserva de mensagens RAW recentes que deve continuar visível antes de qualquer compressão."
                tooltip="Essa é a camada mais fresca do contexto ativo."
              >
                <AdminInput
                  type="number"
                  value={runtimeSettings.checkpointedOmRecentRawTokens}
                  onChange={(event) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      checkpointedOmRecentRawTokens: event.target.value,
                    })
                  }
                  disabled={settingsMutation.isPending || !runtimeSettings.checkpointedOmEnabled}
                />
              </RuntimeSettingField>
              <RuntimeSettingField
                label="OM raw batch tokens"
                description="Tamanho do batch RAW que precisa se acumular além da reserva recente para virar uma observation."
                tooltip="É o gatilho de compressão da camada RAW."
              >
                <AdminInput
                  type="number"
                  value={runtimeSettings.checkpointedOmRawObservationBatchTokens}
                  onChange={(event) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      checkpointedOmRawObservationBatchTokens: event.target.value,
                    })
                  }
                  disabled={settingsMutation.isPending || !runtimeSettings.checkpointedOmEnabled}
                />
              </RuntimeSettingField>
              <RuntimeSettingField
                label="OM reflection batch tokens"
                description="Tamanho do batch de observations necessário para gerar uma reflection."
                tooltip="É o gatilho da segunda camada de compressão."
              >
                <AdminInput
                  type="number"
                  value={runtimeSettings.checkpointedOmObservationReflectionBatchTokens}
                  onChange={(event) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      checkpointedOmObservationReflectionBatchTokens: event.target.value,
                    })
                  }
                  disabled={settingsMutation.isPending || !runtimeSettings.checkpointedOmEnabled}
                />
              </RuntimeSettingField>
              <RuntimeSettingField
                label="OM observation support tokens"
                description="Quanto de observation anterior pode entrar como contexto auxiliar ao gerar uma nova observation."
                tooltip="Serve para continuidade local sem reabrir tudo."
              >
                <AdminInput
                  type="number"
                  value={runtimeSettings.checkpointedOmObservationSupportTokens}
                  onChange={(event) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      checkpointedOmObservationSupportTokens: event.target.value,
                    })
                  }
                  disabled={settingsMutation.isPending || !runtimeSettings.checkpointedOmEnabled}
                />
              </RuntimeSettingField>
              <RuntimeSettingField
                label="OM reflection support tokens"
                description="Quanto de contexto auxiliar pode entrar na geração de uma reflection."
                tooltip="Mantém alguma continuidade entre blocos refletidos sem diluir o batch principal."
              >
                <AdminInput
                  type="number"
                  value={runtimeSettings.checkpointedOmReflectionSupportTokens}
                  onChange={(event) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      checkpointedOmReflectionSupportTokens: event.target.value,
                    })
                  }
                  disabled={settingsMutation.isPending || !runtimeSettings.checkpointedOmEnabled}
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
