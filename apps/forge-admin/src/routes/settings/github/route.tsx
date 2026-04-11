import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings/github')({
  component: SettingsGithubLayoutRoute,
});

function SettingsGithubLayoutRoute() {
  return <Outlet />;
}
