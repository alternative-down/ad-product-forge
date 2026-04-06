import { Outlet, createFileRoute } from '@tanstack/react-router';

import { AdminAreaLayout } from '@/components/admin';

export const Route = createFileRoute('/home')({
  component: HomeLayoutRoute,
});

function HomeLayoutRoute() {
  const sectionItems = [
    { value: '/home', label: 'Geral' },
    { value: '/home/conversations', label: 'Conversas' },
  ];

  return (
    <AdminAreaLayout sectionItems={sectionItems}>
      <Outlet />
    </AdminAreaLayout>
  );
}
