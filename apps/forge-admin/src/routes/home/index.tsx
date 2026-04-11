import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';

import {
  AdminButton,
  AdminDialogBody,
  AdminDialogContent,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminLoadingState,
  AdminDialogTitle,
  AdminInput,
  AdminTextarea,
  HireAgentDialog,
} from '@/components/admin';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { getAgents, getSystemSettings, upsertSystemSettings } from '@/lib/admin-api';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';

export const Route = createFileRoute('/home/')({
  component: HomeIndexRoute,
});

function HomeIndexRoute() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['admin', 'system-settings'],
    queryFn: getSystemSettings,
  });
  const agentsQuery = useQuery({
    queryKey: ['admin', 'agents'],
    queryFn: getAgents,
  });
  const [editOpen, setEditOpen] = useState(false);
  const [hireOpen, setHireOpen] = useState(false);
  const [draft, setDraft] = useState<{
    companyName: string;
    companyContext: string;
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
  const mutation = useMutation({
    mutationFn: upsertSystemSettings,
    onMutate: () => startAdminAction('Salvando empresa...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Empresa atualizada.');
      setEditOpen(false);
      setDraft(null);
      setRuntimeDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-settings'] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const stepDelayMutation = useMutation({
    mutationFn: (input: Partial<{
      stepDelayEnabled: boolean;
      communicationDmFlushingEnabled: boolean;
      communicationGroupFlushingEnabled: boolean;
    }>) => {
      if (!settingsQuery.data) {
        throw new Error('Configuração indisponível.');
      }

      return upsertSystemSettings({
        companyName: settingsQuery.data.companyName,
        companyContext: settingsQuery.data.companyContext,
        stepDelayEnabled: input.stepDelayEnabled ?? settingsQuery.data.stepDelayEnabled,
        communicationDmFlushingEnabled:
          input.communicationDmFlushingEnabled ?? settingsQuery.data.communicationDmFlushingEnabled,
        communicationGroupFlushingEnabled:
          input.communicationGroupFlushingEnabled ?? settingsQuery.data.communicationGroupFlushingEnabled,
      });
    },
    onMutate: () => startAdminAction('Salvando delay entre steps...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Delay entre steps atualizado.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-settings'] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const companyName = draft?.companyName ?? settingsQuery.data?.companyName ?? '';
  const companyContext = draft?.companyContext ?? settingsQuery.data?.companyContext ?? '';
  const agents = agentsQuery.data ?? [];

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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-[-0.06em] sm:text-4xl">
            {settingsQuery.data?.companyName?.trim() || 'Empresa'}
          </h1>
          <AdminButton
            variant="ghost"
            size="icon"
            onClick={() => {
              setDraft({
                companyName: settingsQuery.data?.companyName ?? '',
                companyContext: settingsQuery.data?.companyContext ?? '',
              });
              setEditOpen(true);
            }}
          >
            <Pencil className="h-4 w-4" />
            <span className="sr-only">Editar empresa</span>
          </AdminButton>
        </div>
        {settingsQuery.data?.companyContext?.trim() ? (
          <p className="max-w-3xl text-base text-muted-foreground">{settingsQuery.data.companyContext.trim()}</p>
        ) : null}
        {settingsQuery.isLoading && !settingsQuery.data ? <AdminLoadingState label="Carregando empresa..." /> : null}
      </section>

      <section className="space-y-3 border-t border-border pt-6">
        <div className="flex items-center justify-between gap-4 rounded-sm border border-border px-4 py-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Delay entre steps</div>
            <div className="text-sm text-muted-foreground">
              Ativa o intervalo padrão entre execuções.
            </div>
          </div>
          <Switch
            checked={settingsQuery.data?.stepDelayEnabled ?? true}
            disabled={settingsQuery.isLoading || stepDelayMutation.isPending}
            onCheckedChange={(checked) => stepDelayMutation.mutate({ stepDelayEnabled: checked })}
          />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-sm border border-border px-4 py-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Flushing de mensagens diretas</div>
            <div className="text-sm text-muted-foreground">
              Controla se mensagens DM dos providers acordam agentes automaticamente.
            </div>
          </div>
          <Switch
            checked={settingsQuery.data?.communicationDmFlushingEnabled ?? true}
            disabled={settingsQuery.isLoading || stepDelayMutation.isPending}
            onCheckedChange={(checked) =>
              stepDelayMutation.mutate({ communicationDmFlushingEnabled: checked })
            }
          />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-sm border border-border px-4 py-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Flushing de mensagens em grupo</div>
            <div className="text-sm text-muted-foreground">
              Controla se mensagens de grupo dos providers acordam agentes automaticamente.
            </div>
          </div>
          <Switch
            checked={settingsQuery.data?.communicationGroupFlushingEnabled ?? true}
            disabled={settingsQuery.isLoading || stepDelayMutation.isPending}
            onCheckedChange={(checked) =>
              stepDelayMutation.mutate({ communicationGroupFlushingEnabled: checked })
            }
          />
        </div>
        {stepDelayMutation.error ? <div className="text-sm text-destructive">{stepDelayMutation.error.message}</div> : null}
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">Memória e contexto</div>
          <div className="text-sm text-muted-foreground">
            Configurações globais de `lastMessages`, token limiter e Observational Memory.
          </div>
        </div>

        {runtimeSettings ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();

              if (!settingsQuery.data) {
                return;
              }

              mutation.mutate({
                companyName: settingsQuery.data.companyName,
                companyContext: settingsQuery.data.companyContext,
                stepDelayEnabled: settingsQuery.data.stepDelayEnabled,
                communicationDmFlushingEnabled: settingsQuery.data.communicationDmFlushingEnabled,
                communicationGroupFlushingEnabled: settingsQuery.data.communicationGroupFlushingEnabled,
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
              <div className="space-y-2">
                <label className="text-sm font-medium">Last messages full load</label>
                <Switch
                  checked={runtimeSettings.memoryLastMessagesFullEnabled}
                  disabled={settingsQuery.isLoading || mutation.isPending}
                  onCheckedChange={(checked) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      memoryLastMessagesFullEnabled: checked,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Last messages count</label>
                <AdminInput
                  type="number"
                  value={runtimeSettings.memoryLastMessagesCount}
                  onChange={(event) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      memoryLastMessagesCount: event.target.value,
                    })
                  }
                  disabled={settingsQuery.isLoading || mutation.isPending || runtimeSettings.memoryLastMessagesFullEnabled}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Token count filter</label>
                <Switch
                  checked={runtimeSettings.tokenCountFilterEnabled}
                  disabled={settingsQuery.isLoading || mutation.isPending}
                  onCheckedChange={(checked) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      tokenCountFilterEnabled: checked,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Token count limit</label>
                <AdminInput
                  type="number"
                  value={runtimeSettings.tokenCountFilterLimit}
                  onChange={(event) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      tokenCountFilterLimit: event.target.value,
                    })
                  }
                  disabled={settingsQuery.isLoading || mutation.isPending || !runtimeSettings.tokenCountFilterEnabled}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">OM observation message tokens</label>
                <AdminInput
                  type="number"
                  value={runtimeSettings.omObservationMessageTokens}
                  onChange={(event) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      omObservationMessageTokens: event.target.value,
                    })
                  }
                  disabled={settingsQuery.isLoading || mutation.isPending}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">OM observation buffer tokens</label>
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
                  disabled={settingsQuery.isLoading || mutation.isPending}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">OM observation buffer activation</label>
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
                  disabled={settingsQuery.isLoading || mutation.isPending}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">OM previous observer tokens</label>
                <AdminInput
                  type="number"
                  value={runtimeSettings.omObservationPreviousObserverTokens}
                  onChange={(event) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      omObservationPreviousObserverTokens: event.target.value,
                    })
                  }
                  disabled={settingsQuery.isLoading || mutation.isPending}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">OM reflection observation tokens</label>
                <AdminInput
                  type="number"
                  value={runtimeSettings.omReflectionObservationTokens}
                  onChange={(event) =>
                    setRuntimeDraft({
                      ...runtimeSettings,
                      omReflectionObservationTokens: event.target.value,
                    })
                  }
                  disabled={settingsQuery.isLoading || mutation.isPending}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">OM reflection buffer activation</label>
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
                  disabled={settingsQuery.isLoading || mutation.isPending}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <AdminButton type="submit" disabled={settingsQuery.isLoading || mutation.isPending}>
                {mutation.isPending ? 'Salvando...' : 'Salvar memória e OM'}
              </AdminButton>
            </div>
          </form>
        ) : null}
      </section>

      <section className="space-y-5">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">Agentes</div>
        </div>

        <div className="flex justify-end">
          <AdminButton onClick={() => setHireOpen(true)}>
            Contratar
          </AdminButton>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <Link
              key={agent.agentId}
              to="/agents/$agentId"
              params={{ agentId: agent.agentId }}
              className="block rounded-sm border border-border bg-background px-5 py-4 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center gap-2">
                  <Avatar className="h-14 w-14 border border-border bg-muted">
                    <AvatarFallback className="bg-muted text-sm font-medium text-foreground">
                      {getAgentInitials(agent.name)}
                    </AvatarFallback>
                  </Avatar>
                  <Badge variant="outline" className="rounded-sm">
                    {humanizeAgentStatus(agent.executionState)}
                  </Badge>
                </div>

                <div className="min-w-0 space-y-1">
                  <div className="truncate text-base font-semibold tracking-[-0.03em]">{agent.name}</div>
                  <div className="text-sm text-muted-foreground">{agent.roleName ?? 'Sem papel'}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {agentsQuery.isLoading && agents.length === 0 ? <AdminLoadingState label="Carregando agentes..." /> : null}
        {agents.length === 0 ? <div className="text-sm text-muted-foreground">Nenhum agente ainda.</div> : null}
        {agentsQuery.error ? <div className="text-sm text-destructive">{agentsQuery.error.message}</div> : null}
      </section>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);

          if (!open) {
            setDraft(null);
          }
        }}
      >
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>Editar empresa</AdminDialogTitle>
          </AdminDialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();

              if (!settingsQuery.data) {
                return;
              }

              mutation.mutate({
                companyName: companyName.trim(),
                companyContext: companyContext.trim(),
                stepDelayEnabled: settingsQuery.data.stepDelayEnabled,
                communicationDmFlushingEnabled: settingsQuery.data.communicationDmFlushingEnabled,
                communicationGroupFlushingEnabled: settingsQuery.data.communicationGroupFlushingEnabled,
                memoryLastMessagesFullEnabled: settingsQuery.data.memoryLastMessagesFullEnabled,
                memoryLastMessagesCount: settingsQuery.data.memoryLastMessagesCount,
                tokenCountFilterEnabled: settingsQuery.data.tokenCountFilterEnabled,
                tokenCountFilterLimit: settingsQuery.data.tokenCountFilterLimit,
                omObservationMessageTokens: settingsQuery.data.omObservationMessageTokens,
                omObservationBufferTokens: settingsQuery.data.omObservationBufferTokens,
                omObservationBufferActivation: settingsQuery.data.omObservationBufferActivation,
                omObservationPreviousObserverTokens: settingsQuery.data.omObservationPreviousObserverTokens,
                omReflectionObservationTokens: settingsQuery.data.omReflectionObservationTokens,
                omReflectionBufferActivation: settingsQuery.data.omReflectionBufferActivation,
              });
            }}
          >
            <AdminDialogBody>
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="company-name">
                    Nome
                  </label>
                  <AdminInput
                    id="company-name"
                    value={companyName}
                    onChange={(event) =>
                      setDraft({
                        companyName: event.target.value,
                        companyContext,
                      })
                    }
                    disabled={settingsQuery.isLoading || mutation.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="company-description">
                    Descrição
                  </label>
                  <AdminTextarea
                    id="company-description"
                    rows={8}
                    value={companyContext}
                    onChange={(event) =>
                      setDraft({
                        companyName,
                        companyContext: event.target.value,
                      })
                    }
                    disabled={settingsQuery.isLoading || mutation.isPending}
                  />
                </div>
                {settingsQuery.error ? <div className="text-sm text-destructive">{settingsQuery.error.message}</div> : null}
                {mutation.error ? <div className="text-sm text-destructive">{mutation.error.message}</div> : null}
              </div>
            </AdminDialogBody>

            <AdminDialogFooter>
              <AdminButton type="submit" disabled={settingsQuery.isLoading || mutation.isPending}>
                {mutation.isPending ? 'Salvando...' : 'Salvar'}
              </AdminButton>
            </AdminDialogFooter>
          </form>
        </AdminDialogContent>
      </Dialog>

      <HireAgentDialog open={hireOpen} onOpenChange={setHireOpen} />
    </div>
  );
}

function getAgentInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return 'AG';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function humanizeAgentStatus(executionState: 'idle' | 'running') {
  if (executionState === 'running') {
    return 'Trabalhando';
  }

  return 'Ocioso';
}
