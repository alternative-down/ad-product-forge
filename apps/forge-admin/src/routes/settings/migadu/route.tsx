import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings/migadu')({
  component: SettingsMigaduLayoutRoute,
});

function SettingsMigaduLayoutRoute() {
  return <Outlet />;
}
