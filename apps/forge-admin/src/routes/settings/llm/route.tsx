import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings/llm')({
  component: SettingsLlmLayoutRoute,
});

function SettingsLlmLayoutRoute() {
  return <Outlet />;
}
