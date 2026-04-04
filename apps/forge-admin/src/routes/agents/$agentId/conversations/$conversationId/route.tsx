import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/agents/$agentId/conversations/$conversationId')({
  component: AgentConversationDetailLayoutRoute,
});

function AgentConversationDetailLayoutRoute() {
  return <Outlet />;
}
