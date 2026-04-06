import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/agents/$agentId')({
  component: AgentDetailLayoutRoute,
});

function AgentDetailLayoutRoute() {
  return <Outlet />;
}
