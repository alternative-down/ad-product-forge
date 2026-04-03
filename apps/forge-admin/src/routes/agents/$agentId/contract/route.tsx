import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/agents/$agentId/contract')({
  component: AgentContractLayoutRoute,
});

function AgentContractLayoutRoute() {
  return <Outlet />;
}
