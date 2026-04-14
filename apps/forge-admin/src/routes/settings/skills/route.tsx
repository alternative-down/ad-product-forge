import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings/skills')({
  component: SettingsSkillsLayoutRoute,
});

function SettingsSkillsLayoutRoute() {
  return <Outlet />;
}
