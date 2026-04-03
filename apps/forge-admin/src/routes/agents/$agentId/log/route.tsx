import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/agents/$agentId/log')({
  component: AgentLogLayoutRoute,
});

function AgentLogLayoutRoute() {
  return <Outlet />;
}
