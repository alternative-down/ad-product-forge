import { Home } from 'lucide-react';
import { Navigate, Outlet, createFileRoute, useRouterState } from '@tanstack/react-router';

import '../../styles/app.css';
import { AppShell, SidebarNav, TopBar } from '@/components/admin';
import { getStoredAdminSecret } from '@/lib/admin-secret';

export const Route = createFileRoute('/home')({
  component: HomeLayoutRoute,
});

function HomeLayoutRoute() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  if (!getStoredAdminSecret()) {
    return <Navigate to="/" />;
  }

  return (
    <AppShell
      sidebar={
        <SidebarNav
          brand="Forja"
          items={[
            {
              to: '/home',
              label: 'Home',
              icon: <Home className="h-4 w-4" />,
              active: pathname === '/home',
            },
          ]}
        />
      }
      topbar={<TopBar title="Home" />}
    >
      <Outlet />
    </AppShell>
  );
}
