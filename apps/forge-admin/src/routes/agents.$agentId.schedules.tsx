import { createFileRoute } from '@tanstack/react-router';

import { AgentDetailPage } from '../features/agents/page';

export const Route = createFileRoute('/agents/$agentId/schedules')({
  component: AgentSchedulesRoute,
});

function AgentSchedulesRoute() {
  const params = Route.useParams();

  return <AgentDetailPage agentId={params.agentId} tab="schedules" />;
}
