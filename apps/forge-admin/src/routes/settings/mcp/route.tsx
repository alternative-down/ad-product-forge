import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings/mcp')({
  component: SettingsMcpLayoutRoute,
});

function SettingsMcpLayoutRoute() {
  return <Outlet />;
}
