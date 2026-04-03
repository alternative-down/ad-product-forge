import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/integrations/coolify')({
  component: IntegrationsCoolifyLayoutRoute,
});

function IntegrationsCoolifyLayoutRoute() {
  return <Outlet />;
}
