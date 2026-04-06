import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/agents/$agentId/github')({
  component: AgentGithubLayoutRoute,
});

function AgentGithubLayoutRoute() {
  return <Outlet />;
}
