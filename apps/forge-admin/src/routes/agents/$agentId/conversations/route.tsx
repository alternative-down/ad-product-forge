import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/agents/$agentId/conversations')({
  component: AgentConversationsLayoutRoute,
});

function AgentConversationsLayoutRoute() {
  return <Outlet />;
}
