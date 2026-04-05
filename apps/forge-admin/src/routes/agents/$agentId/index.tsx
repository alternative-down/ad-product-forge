import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, RotateCw } from 'lucide-react';
import { useState } from 'react';

import {
  AdminButton,
  AdminLoadingState,
  AdminScrollArea,
} from '@/components/admin';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { changeAgentRole, getAgent, getRoles, getSystemLlm, reloadAgent, updateAgentConfig } from '@/lib/admin-api';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';

import { AgentProfileDialog } from './-agent-profile-dialog';
import {
  createAgentProfileForm,
  formatAverageInterval,
  formatPercent,
  formatUsd,
  getAgentInitials,
  humanizeAgentStatus,
  type AgentProfileForm,
} from './-agent-detail-helpers';

export const Route = createFileRoute('/agents/$agentId/')({
  component: AgentDetailIndexRoute,
});

function AgentDetailIndexRoute() {
  const { agentId } = Route.useParams();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<AgentProfileForm | null>(null);
  const agentQuery = useQuery({
    queryKey: ['admin', 'agent', agentId],
    queryFn: () => getAgent(agentId),
  });
  const rolesQuery = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: getRoles,
  });
  const llmQuery = useQuery({
    queryKey: ['admin', 'system-llm'],
    queryFn: getSystemLlm,
  });
  const reloadMutation = useMutation({
    mutationFn: () => reloadAgent(agentId),
    onMutate: () => startAdminAction('Recarregando agente...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Agente recarregado.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const mutation = useMutation({
    mutationFn: async (input: AgentProfileForm) => {
      await updateAgentConfig({
        agentId,
        name: input.name.trim(),
        description: input.description.trim() || null,
        instructions: input.instructions.trim(),
        workspaceAutoSync: input.workspaceAutoSync,
        workspaceBm25: input.workspaceBm25,
        modelProfileId: input.modelProfileId,
        omModelProfileId: input.omModelProfileId,
      });

      const currentRoleId = agentQuery.data?.role?.roleId ?? null;

      if (input.roleId && input.roleId !== currentRoleId) {
        await changeAgentRole({
          agentId,
          roleId: input.roleId,
        });
      }
    },
    onMutate: () => startAdminAction('Salvando agente...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Agente atualizado.');
      setDialogOpen(false);
      setForm(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const agent = agentQuery.data;
  const profiles = llmQuery.data?.profiles.filter((profile) => profile.isEnabled) ?? [];

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {agentQuery.isLoading && !agent ? <AdminLoadingState label="Carregando agente..." /> : null}
      {agent ? (
        <>
          <section className="space-y-5">
            <div className="flex items-start gap-5">
              <div className="flex flex-col items-center gap-2">
                <Avatar className="h-20 w-20 border border-border bg-muted">
                  <AvatarFallback className="bg-muted text-base font-medium text-foreground">
                    {getAgentInitials(agent.name)}
                  </AvatarFallback>
                </Avatar>
                <Badge variant="outline" className="rounded-sm">
                  {humanizeAgentStatus(agent.executionState)}
                </Badge>
              </div>

              <div className="min-w-0 space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-semibold tracking-[-0.04em]">{agent.name}</div>
                    <AdminButton
                      variant="ghost"
                      size="icon"
                      disabled={reloadMutation.isPending}
                      onClick={() => reloadMutation.mutate()}
                    >
                      <RotateCw className="h-4 w-4" />
                      <span className="sr-only">Recarregar agente</span>
                    </AdminButton>
                    <AdminButton
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setForm(createAgentProfileForm(agent));
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">Editar perfil</span>
                    </AdminButton>
                  </div>
                  <div className="text-sm text-muted-foreground">{agent.role?.name ?? 'Sem papel'}</div>
                </div>
              </div>
            </div>
          </section>

          {agent.description ? (
            <section className="space-y-3">
              <div className="text-lg font-semibold tracking-[-0.03em]">Descrição</div>
              <div className="max-w-3xl text-sm leading-6 text-muted-foreground">{agent.description}</div>
            </section>
          ) : null}

          <section className="space-y-5">
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
              <MetricItem
                label="Valor do contrato"
                value={agent.activeContract ? formatUsd(agent.activeContract.weeklyValueUsd) : 'Sem contrato'}
              />
              <MetricItem
                label="% de uso"
                value={agent.activeContract ? `${formatPercent(agent.activeContract.spentPercent)}%` : '0%'}
              />
              <MetricItem
                label="Tempo médio de intervalo"
                value={formatAverageInterval(agent.recentExecutionSteps)}
              />
            </div>
          </section>

          <section className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <MetricItem
                label="Perfil principal"
                value={agent.modelProfile ? agent.modelProfile.name : 'Sem perfil'}
              />
              <MetricItem
                label="Perfil OM"
                value={agent.omModelProfile ? agent.omModelProfile.name : 'Sem perfil'}
              />
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-lg font-semibold tracking-[-0.03em]">Instruções</div>
            <AdminScrollArea className="h-[min(20rem,calc(100dvh-18rem))] rounded-sm border border-border bg-background" contentClassName="px-4 py-3">
              <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                {agent.instructions.trim() || 'Sem instruções.'}
              </div>
            </AdminScrollArea>
          </section>
        </>
      ) : null}

      {agentQuery.error ? <div className="text-sm text-destructive">{agentQuery.error.message}</div> : null}
      {reloadMutation.error ? <div className="text-sm text-destructive">{reloadMutation.error.message}</div> : null}

      <AgentProfileDialog
        open={dialogOpen}
        pending={mutation.isPending}
        form={form}
        roles={(rolesQuery.data?.items ?? []).map((role) => ({
          roleId: role.roleId,
          name: role.name,
        }))}
        profiles={profiles.map((profile) => ({
          profileId: profile.profileId,
          name: profile.name,
        }))}
        errorMessage={mutation.error?.message}
        onOpenChange={(open) => {
          setDialogOpen(open);

          if (!open) {
            setForm(null);
          }
        }}
        onFormChange={(updater) => setForm((current) => (current ? updater(current) : current))}
        onSubmit={() => {
          if (form) {
            mutation.mutate(form);
          }
        }}
      />
    </div>
  );
}

function MetricItem(input: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-sm text-muted-foreground">{input.label}</div>
      <div className="text-xl font-semibold tracking-[-0.03em]">{input.value}</div>
    </div>
  );
}
