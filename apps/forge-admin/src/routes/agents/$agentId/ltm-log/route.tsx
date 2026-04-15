import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/agents/$agentId/ltm-log')({
  component: AgentLongTermMemoryLogLayoutRoute,
});

function AgentLongTermMemoryLogLayoutRoute() {
  return <Outlet />;
}
