import { Link, Navigate, Outlet, createFileRoute, useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import '../../styles/app.css';
import { AppShell, ThemeToggleButton } from '@/components/admin';
import { getStoredAdminSecret, getStoredAdminTheme, setStoredAdminTheme } from '@/lib/admin-secret';

export const Route = createFileRoute('/home')({
  component: HomeLayoutRoute,
});

function HomeLayoutRoute() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => getStoredAdminTheme());

  useEffect(() => {
    setStoredAdminTheme(theme);
  }, [theme]);

  if (!getStoredAdminSecret()) {
    return <Navigate to="/" />;
  }

  return (
    <AppShell
      theme={theme}
      topbar={
        <div className="flex min-h-18 items-center justify-between gap-8 px-6 py-4">
          <div className="flex items-center gap-8">
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
          <ThemeToggleButton
            theme={theme}
            onToggle={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          />
        </div>
      }
    >
      <div className="grid gap-8 md:grid-cols-[180px_minmax(0,1fr)]">
        <aside>
          <nav className="flex flex-col gap-1">
            <Link
              to="/home"
              className={
                pathname === '/home'
                  ? 'rounded-md bg-muted px-3 py-2 text-sm font-medium text-foreground'
                  : 'rounded-md px-3 py-2 text-sm text-muted-foreground'
              }
            >
              Geral
            </Link>
            <Link
              to="/home/llm"
              className={
                pathname === '/home/llm'
                  ? 'rounded-md bg-muted px-3 py-2 text-sm font-medium text-foreground'
                  : 'rounded-md px-3 py-2 text-sm text-muted-foreground'
              }
            >
              Perfis
            </Link>
            <Link
              to="/home/llm/prices"
              className={
                pathname === '/home/llm/prices'
                  ? 'rounded-md bg-muted px-3 py-2 text-sm font-medium text-foreground'
                  : 'rounded-md px-3 py-2 text-sm text-muted-foreground'
              }
            >
              Preços
            </Link>
          </nav>
        </aside>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </AppShell>
  );
}
