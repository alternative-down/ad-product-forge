import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/agents/$agentId/skills')({
  component: AgentSkillsLayoutRoute,
});

function AgentSkillsLayoutRoute() {
  return <Outlet />;
}
