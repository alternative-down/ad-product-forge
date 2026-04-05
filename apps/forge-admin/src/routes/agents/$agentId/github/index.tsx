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
  const registrationUrl = provisioning?.registrationUrl ?? buildGithubRegisterUrl(agentId);
  const installUrl = provisioning?.installUrl ?? null;

  return (
    <div className="min-w-0 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader
        title="Github"
        actions={
          <>
            <AdminButton asChild>
              <a href={registrationUrl} target="_blank" rel="noreferrer">
                Criar app
              </a>
            </AdminButton>
            <AdminButton asChild variant="outline" disabled={!installUrl}>
              <a href={installUrl ?? '#'} target="_blank" rel="noreferrer" aria-disabled={!installUrl}>
                Instalar app
              </a>
            </AdminButton>
          </>
        }
      />

      {agentQuery.isLoading && !agentQuery.data ? <AdminLoadingState label="Carregando Github..." /> : null}

      <section className="space-y-4">
        <ReadOnlyItem label="Status" value={provisioning ? humanizeGithubStatus(provisioning.status) : 'Pendente'} />
        <ReadOnlyItem label="Link de criação" value={registrationUrl} />
        <ReadOnlyItem label="Link de instalação" value={installUrl ?? 'Disponível após criar o app.'} />
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

function buildGithubRegisterUrl(agentId: string) {
  const baseUrl = getConfiguredApiBaseUrl();
  return `${baseUrl}/github/apps/${encodeURIComponent(agentId)}/register`;
}

function getConfiguredApiBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_FORGE_API_BASE_URL?.trim();

  if (configuredBaseUrl) {
    return configuredBaseUrl.endsWith('/') ? configuredBaseUrl.slice(0, -1) : configuredBaseUrl;
  }

  if (typeof window === 'undefined') {
    return '';
  }

  const { protocol, hostname, port } = window.location;

  if (hostname.startsWith('forge-admin.')) {
    return `${protocol}//forge.${hostname.slice('forge-admin.'.length)}`;
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:${port || '3011'}`;
  }

  return '';
}
