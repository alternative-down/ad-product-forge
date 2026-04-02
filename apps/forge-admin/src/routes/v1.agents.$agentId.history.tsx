import { createFileRoute } from '@tanstack/react-router';

import { AgentDetailPage } from '../v1/features/agents/page';

export const Route = createFileRoute('/v1/agents/$agentId/history')({
  component: AgentHistoryRoute,
});

function AgentHistoryRoute() {
  const params = Route.useParams();

  return <AgentDetailPage agentId={params.agentId} tab="history" />;
}
