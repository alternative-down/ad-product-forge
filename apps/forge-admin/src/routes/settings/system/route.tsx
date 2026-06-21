import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings/system')({
  component: SettingsSystemLayoutRoute,
});

function SettingsSystemLayoutRoute() {
  return <Outlet />;
}
