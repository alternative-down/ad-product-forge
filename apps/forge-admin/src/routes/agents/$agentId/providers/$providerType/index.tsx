import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { AdminLoadingState } from '@/components/admin';
import { getAgent } from '@/lib/admin-api/index';

import { DiscordProviderForm } from '../../components/agents/providers/discord-provider-form';
import { EmailProviderForm } from '../../components/agents/providers/email-provider-form';

export const Route = createFileRoute('/agents/$agentId/providers/$providerType/')({
  component: AgentProviderIndexRoute,
});

function AgentProviderIndexRoute() {
  const { agentId, providerType } = Route.useParams();
  const agentQuery = useQuery({
    queryKey: ['admin', 'agent', agentId],
    queryFn: () => getAgent(agentId),
  });
  const provider = useMemo(
    () => agentQuery.data?.providers.find((item) => item.providerType === providerType) ?? null,
    [agentQuery.data?.providers, providerType],
  );

  if (agentQuery.isLoading && !agentQuery.data) {
    return <AdminLoadingState label="Carregando provider..." />;
  }

  if (providerType === 'internal-chat') {
    return <div className="text-sm text-muted-foreground">Provider não disponível nesta área.</div>;
  }

  if (providerType === 'discord') {
    return <DiscordProviderForm agentId={agentId} credentials={provider?.credentials} configured={Boolean(provider)} />;
  }

  if (providerType === 'email') {
    return <EmailProviderForm agentId={agentId} credentials={provider?.credentials} configured={Boolean(provider)} />;
  }

  return <div className="text-sm text-muted-foreground">Provider não suportado nesta área.</div>;
}
