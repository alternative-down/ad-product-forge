import { Link, Navigate, Outlet, createFileRoute, useRouterState } from '@tanstack/react-router';

import '../../styles/app.css';
import { AppShell } from '@/components/admin';
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
        <div className="flex min-h-18 items-center gap-8 px-6 py-4">
          <div className="text-2xl font-semibold tracking-[-0.06em] sm:text-3xl">Forja</div>
          <nav className="flex items-center gap-4">
            <Link
              to="/home"
              className={pathname === '/home' ? 'text-sm font-medium text-foreground' : 'text-sm text-muted-foreground'}
            >
              Home
            </Link>
          </nav>
        </div>
      }
    >
      <Outlet />
    </AppShell>
  );
}
