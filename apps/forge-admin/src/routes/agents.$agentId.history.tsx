import { createFileRoute } from '@tanstack/react-router';

import { AgentDetailPage } from '../features/agents/page';

export const Route = createFileRoute('/agents/$agentId/history')({
  component: AgentHistoryRoute,
});

function AgentHistoryRoute() {
  const params = Route.useParams();

  return <AgentDetailPage agentId={params.agentId} tab="history" />;
}
