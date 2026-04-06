import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/integrations/github')({
  component: IntegrationsGithubLayoutRoute,
});

function IntegrationsGithubLayoutRoute() {
  return <Outlet />;
}
