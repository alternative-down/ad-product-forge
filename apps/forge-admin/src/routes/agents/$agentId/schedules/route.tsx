import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/agents/$agentId/schedules')({
  component: AgentSchedulesLayoutRoute,
});

function AgentSchedulesLayoutRoute() {
  return <Outlet />;
}
