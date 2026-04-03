import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import { getAgent } from '@/lib/admin-api';

export const Route = createFileRoute('/agents/$agentId/github/')({
  component: AgentGithubIndexRoute,
});

function AgentGithubIndexRoute() {
  const { agentId } = Route.useParams();
  const agentQuery = useQuery({
    queryKey: ['admin', 'agent', agentId],
    queryFn: () => getAgent(agentId),
  });
  const provisioning = agentQuery.data?.githubProvisioning ?? null;

  return (
    <div className="min-w-0 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {provisioning ? (
        <>
          <section className="space-y-1">
            <div className="text-2xl font-semibold tracking-[-0.04em]">Github</div>
            <div className="text-sm text-muted-foreground">{humanizeGithubStatus(provisioning.status)}</div>
          </section>

          <section className="space-y-4">
            <ReadOnlyItem label="Status" value={humanizeGithubStatus(provisioning.status)} />
            <ReadOnlyItem label="Registration URL" value={provisioning.registrationUrl} />
            <ReadOnlyItem label="Install URL" value={provisioning.installUrl ?? '—'} />
          </section>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">Nenhuma configuração de Github para este agente.</div>
      )}

      {agentQuery.error ? <div className="text-sm text-destructive">{agentQuery.error.message}</div> : null}
    </div>
  );
}

function ReadOnlyItem(input: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-sm text-muted-foreground">{input.label}</div>
      <div className="break-all text-sm leading-6 text-foreground">{input.value}</div>
    </div>
  );
}

function humanizeGithubStatus(status: 'pending' | 'created' | 'active') {
  if (status === 'pending') {
    return 'Pendente';
  }

  if (status === 'created') {
    return 'Criado';
  }

  return 'Ativo';
}
