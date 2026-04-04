import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/agents/roles')({
  component: AgentRolesLayoutRoute,
});

function AgentRolesLayoutRoute() {
  return <Outlet />;
}
