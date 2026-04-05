import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, RotateCw } from 'lucide-react';
import { useState } from 'react';

import {
  AdminDialogBody,
  AdminButton,
  AdminDialogContent,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminInput,
  AdminLoadingState,
  AdminTextarea,
  AdminScrollArea,
} from '@/components/admin';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { changeAgentRole, getAgent, getRoles, getSystemLlm, reloadAgent, updateAgentConfig, type AgentDetail } from '@/lib/admin-api';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';

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
  const selectedRoleName =
    rolesQuery.data?.items.find((role) => role.roleId === form?.roleId)?.name ?? 'Sem papel';
  const selectedModelProfileName =
    profiles.find((profile) => profile.profileId === form?.modelProfileId)?.name ?? 'Selecione um perfil';
  const selectedOmProfileName =
    profiles.find((profile) => profile.profileId === form?.omModelProfileId)?.name ?? 'Selecione um perfil';

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

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);

          if (!open) {
            setForm(null);
          }
        }}
      >
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>Editar agente</AdminDialogTitle>
          </AdminDialogHeader>

          {form ? (
            <form
              className="flex flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate(form);
              }}
            >
              <AdminDialogBody>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="agent-name">
                    Nome
                  </label>
                  <AdminInput
                    id="agent-name"
                    value={form.name}
                    onChange={(event) => setForm((current) => current ? { ...current, name: event.target.value } : current)}
                    disabled={mutation.isPending}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="agent-role">
                    Papel
                  </label>
                  <Select
                    value={form.roleId || '__none__'}
                    onValueChange={(value) =>
                      setForm((current) => current ? { ...current, roleId: value === '__none__' ? '' : value } : current)
                    }
                    disabled={mutation.isPending}
                  >
                    <SelectTrigger id="agent-role" className="w-full">
                      <SelectValue>{selectedRoleName}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem papel</SelectItem>
                      {(rolesQuery.data?.items ?? []).map((role) => (
                        <SelectItem key={role.roleId} value={role.roleId}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="agent-description">
                    Descrição
                  </label>
                  <AdminTextarea
                    id="agent-description"
                    value={form.description}
                    onChange={(event) => setForm((current) => current ? { ...current, description: event.target.value } : current)}
                    disabled={mutation.isPending}
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="agent-model-profile">
                      Perfil principal
                    </label>
                    <Select
                      value={form.modelProfileId}
                      onValueChange={(value) =>
                        setForm((current) => current ? { ...current, modelProfileId: value } : current)
                      }
                      disabled={mutation.isPending}
                    >
                      <SelectTrigger id="agent-model-profile" className="w-full">
                        <SelectValue>{selectedModelProfileName}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map((profile) => (
                          <SelectItem key={profile.profileId} value={profile.profileId}>
                            {profile.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="agent-om-profile">
                      Perfil OM
                    </label>
                    <Select
                      value={form.omModelProfileId}
                      onValueChange={(value) =>
                        setForm((current) => current ? { ...current, omModelProfileId: value } : current)
                      }
                      disabled={mutation.isPending}
                    >
                      <SelectTrigger id="agent-om-profile" className="w-full">
                        <SelectValue>{selectedOmProfileName}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map((profile) => (
                          <SelectItem key={profile.profileId} value={profile.profileId}>
                            {profile.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="agent-instructions">
                    Instruções
                  </label>
                  <AdminTextarea
                    id="agent-instructions"
                    value={form.instructions}
                    onChange={(event) => setForm((current) => current ? { ...current, instructions: event.target.value } : current)}
                    disabled={mutation.isPending}
                    rows={10}
                  />
                </div>

                {mutation.error ? <div className="text-sm text-destructive">{mutation.error.message}</div> : null}
              </AdminDialogBody>

              <AdminDialogFooter>
                <AdminButton
                  type="submit"
                  disabled={
                    mutation.isPending ||
                    !form.name.trim() ||
                    !form.instructions.trim() ||
                    !form.modelProfileId ||
                    !form.omModelProfileId
                  }
                >
                  {mutation.isPending ? 'Salvando...' : 'Salvar'}
                </AdminButton>
              </AdminDialogFooter>
            </form>
          ) : null}
        </AdminDialogContent>
      </Dialog>
    </div>
  );
}

type AgentProfileForm = {
  name: string;
  roleId: string;
  description: string;
  instructions: string;
  modelProfileId: string;
  omModelProfileId: string;
  workspaceAutoSync: boolean;
  workspaceBm25: boolean;
};

function createAgentProfileForm(agent: AgentDetail): AgentProfileForm {
  return {
    name: agent.name,
    roleId: agent.role?.roleId ?? '',
    description: agent.description ?? '',
    instructions: agent.instructions,
    modelProfileId: agent.modelProfile?.profileId ?? '',
    omModelProfileId: agent.omModelProfile?.profileId ?? '',
    workspaceAutoSync: agent.workspace.autoSync,
    workspaceBm25: agent.workspace.bm25,
  };
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
  return executionState === 'running' ? 'Trabalhando' : 'Ocioso';
}

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatAverageInterval(steps: AgentDetail['recentExecutionSteps']) {
  if (steps.length < 2) {
    return 'Sem dados';
  }

  const sortedSteps = [...steps].sort((left, right) => left.createdAt - right.createdAt);
  let totalDiff = 0;

  for (let index = 1; index < sortedSteps.length; index += 1) {
    totalDiff += sortedSteps[index].createdAt - sortedSteps[index - 1].createdAt;
  }

  const averageMs = totalDiff / (sortedSteps.length - 1);
  const totalMinutes = Math.round(averageMs / 60000);

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return `${hours} h`;
  }

  return `${hours} h ${minutes} min`;
}
