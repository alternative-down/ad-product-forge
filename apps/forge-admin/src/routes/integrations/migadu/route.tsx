import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/integrations/migadu')({
  component: IntegrationsMigaduLayoutRoute,
});

function IntegrationsMigaduLayoutRoute() {
  return <Outlet />;
}
