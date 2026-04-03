import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import { ScrollArea } from '@/components/ui/scroll-area';
import { getAgent } from '@/lib/admin-api';

export const Route = createFileRoute('/agents/$agentId/providers/$providerType/')({
  component: AgentProviderIndexRoute,
});

function AgentProviderIndexRoute() {
  const { agentId, providerType } = Route.useParams();
  const agentQuery = useQuery({
    queryKey: ['admin', 'agent', agentId],
    queryFn: () => getAgent(agentId),
  });
  const provider = agentQuery.data?.providers.find((item) => item.providerType === providerType) ?? null;

  return (
    <div className="min-w-0 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {provider ? (
        <>
          <section className="space-y-1">
            <div className="text-2xl font-semibold tracking-[-0.04em]">{humanizeProviderType(provider.providerType)}</div>
            <div className="text-sm text-muted-foreground">
              {provider.editable ? 'Configuração editável' : 'Configuração interna do sistema'}
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-lg font-semibold tracking-[-0.03em]">Configuração</div>
            <ScrollArea className="h-[min(24rem,calc(100dvh-18rem))] rounded-sm border border-border bg-background">
              <pre className="whitespace-pre-wrap px-4 py-3 text-sm leading-6 text-foreground">
                {formatProviderCredentials(provider.credentials)}
              </pre>
            </ScrollArea>
          </section>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">Provider não encontrado.</div>
      )}

      {agentQuery.error ? <div className="text-sm text-destructive">{agentQuery.error.message}</div> : null}
    </div>
  );
}

function humanizeProviderType(providerType: string) {
  if (providerType === 'internal-chat') {
    return 'Internal Chat';
  }

  if (providerType === 'discord') {
    return 'Discord';
  }

  if (providerType === 'email') {
    return 'Email';
  }

  return providerType;
}

function formatProviderCredentials(credentials: unknown) {
  if (credentials == null) {
    return 'Sem credenciais expostas.';
  }

  if (typeof credentials === 'string') {
    return credentials;
  }

  return JSON.stringify(credentials, null, 2);
}
