import { Outlet, createFileRoute } from '@tanstack/react-router';

import { AdminAreaLayout } from '@/components/admin';

export const Route = createFileRoute('/settings')({
  component: SettingsLayoutRoute,
});

function SettingsLayoutRoute() {
  const sectionItems = [
    { value: '/settings', label: 'Geral' },
    { value: '/settings/llm', label: 'Perfis' },
    { value: '/settings/prices', label: 'Preços' },
    { value: '/settings/mcp', label: 'MCP' },
    { value: '/settings/skills', label: 'Skills' },
    { value: '/settings/github', label: 'Github' },
    { value: '/settings/coolify', label: 'Coolify' },
    { value: '/settings/migadu', label: 'Migadu' },
    { value: '/settings/minimax', label: 'MiniMax' },
  ];

  return (
    <AdminAreaLayout sectionItems={sectionItems}>
      <Outlet />
    </AdminAreaLayout>
  );
}
