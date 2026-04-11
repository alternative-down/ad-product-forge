import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings/minimax')({
  component: SettingsMinimaxLayoutRoute,
});

function SettingsMinimaxLayoutRoute() {
  return <Outlet />;
}
