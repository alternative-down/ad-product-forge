import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import { AdminButton, AdminLoadingState, PageHeader } from '@/components/admin';
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
  const registrationUrl = provisioning?.registrationUrl ?? null;
  const installUrl = provisioning?.installUrl ?? null;

  return (
    <div className="min-w-0 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader
        title="Github App"
        actions={
          <>
            {registrationUrl ? (
              <AdminButton asChild>
                <a href={registrationUrl} target="_blank" rel="noreferrer">
                  Criar app
                </a>
              </AdminButton>
            ) : (
              <AdminButton disabled>
                Criar app
              </AdminButton>
            )}
            {installUrl ? (
              <AdminButton asChild variant="outline">
                <a href={installUrl} target="_blank" rel="noreferrer">
                  Instalar app
                </a>
              </AdminButton>
            ) : (
              <AdminButton variant="outline" disabled>
                Instalar app
              </AdminButton>
            )}
          </>
        }
      />

      {agentQuery.isLoading && !agentQuery.data ? <AdminLoadingState label="Carregando Github App..." /> : null}

      <section className="space-y-4">
        <ReadOnlyItem label="Status" value={provisioning ? humanizeGithubStatus(provisioning.status) : '—'} />
        <ReadOnlyItem label="Link de criação" value={registrationUrl ?? '—'} />
        <ReadOnlyItem label="Link de instalação" value={installUrl ?? '—'} />
      </section>

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
