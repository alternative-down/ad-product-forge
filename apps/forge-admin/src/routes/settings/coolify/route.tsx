import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings/coolify')({
  component: SettingsCoolifyLayoutRoute,
});

function SettingsCoolifyLayoutRoute() {
  return <Outlet />;
}
