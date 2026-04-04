import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/agents/$agentId/workspace')({
  component: AgentWorkspaceLayoutRoute,
});

function AgentWorkspaceLayoutRoute() {
  return <Outlet />;
}
