import { Outlet, createFileRoute } from '@tanstack/react-router';

import { AdminAreaLayout } from '@/components/admin';

export const Route = createFileRoute('/integrations')({
  component: IntegrationsLayoutRoute,
});

function IntegrationsLayoutRoute() {
  const sectionItems = [
    { value: '/integrations', label: 'Perfis' },
    { value: '/integrations/prices', label: 'Preços' },
    { value: '/integrations/github', label: 'Github' },
    { value: '/integrations/coolify', label: 'Coolify' },
    { value: '/integrations/migadu', label: 'Migadu' },
    { value: '/integrations/minimax', label: 'MiniMax' },
  ];

  return (
    <AdminAreaLayout sectionItems={sectionItems}>
      <Outlet />
    </AdminAreaLayout>
  );
}
