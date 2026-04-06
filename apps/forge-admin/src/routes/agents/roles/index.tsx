import { createFileRoute } from '@tanstack/react-router';

import { RolesPage } from '@/components/admin';

export const Route = createFileRoute('/agents/roles/')({
  component: AgentRolesIndexRoute,
});

function AgentRolesIndexRoute() {
  return <RolesPage />;
}
