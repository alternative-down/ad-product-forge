import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/integrations/minimax')({
  component: IntegrationsMinimaxLayoutRoute,
});

function IntegrationsMinimaxLayoutRoute() {
  return <Outlet />;
}
