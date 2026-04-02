import { createFileRoute } from '@tanstack/react-router';

import { AgentDetailPage } from '../v1/features/agents/page';

export const Route = createFileRoute('/v1/agents/$agentId/schedules')({
  component: AgentSchedulesRoute,
});

function AgentSchedulesRoute() {
  const params = Route.useParams();

  return <AgentDetailPage agentId={params.agentId} tab="schedules" />;
}
