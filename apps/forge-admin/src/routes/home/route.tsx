import { Home } from 'lucide-react';
import { Link, Navigate, Outlet, createFileRoute, useRouterState } from '@tanstack/react-router';

import '../../styles/app.css';
import { AppShell, TopBar } from '@/components/admin';
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
      topbar={
        <TopBar
          title="Forja"
          actions={
            <div className="flex items-center gap-2">
              <Link
                to="/home"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
                data-active={pathname === '/home' ? 'true' : 'false'}
              >
                <Home className="h-4 w-4" />
                Home
              </Link>
            </div>
          }
        />
      }
    >
      <Outlet />
    </AppShell>
  );
}
