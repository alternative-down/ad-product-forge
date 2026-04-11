import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings/prices')({
  component: SettingsPricesLayoutRoute,
});

function SettingsPricesLayoutRoute() {
  return <Outlet />;
}
