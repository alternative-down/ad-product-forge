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
  AdminDialogTitle,
  AdminInput,
  AdminTextarea,
  HireAgentDialog,
} from '@/components/admin';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { getAgents, getSystemSettings, upsertSystemSettings } from '@/lib/admin-api';

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
  const mutation = useMutation({
    mutationFn: upsertSystemSettings,
    onSuccess: async () => {
      setEditOpen(false);
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-settings'] });
    },
  });
  const companyName = draft?.companyName ?? settingsQuery.data?.companyName ?? '';
  const companyContext = draft?.companyContext ?? settingsQuery.data?.companyContext ?? '';
  const agents = agentsQuery.data ?? [];

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
