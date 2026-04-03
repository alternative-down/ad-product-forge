import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/agents/$agentId/providers/$providerType')({
  component: AgentProviderLayoutRoute,
});

function AgentProviderLayoutRoute() {
  return <Outlet />;
}
