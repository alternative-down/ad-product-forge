import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/agents/$agentId/notifications')({
  component: AgentNotificationsLayoutRoute,
});

function AgentNotificationsLayoutRoute() {
  return <Outlet />;
}
