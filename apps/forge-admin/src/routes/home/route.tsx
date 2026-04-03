import { Link, Navigate, Outlet, createFileRoute, useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import '../../styles/app.css';
import { AdminTopbar, AppShell } from '@/components/admin';
import { getStoredAdminSecret, getStoredAdminTheme, setStoredAdminTheme } from '@/lib/admin-secret';
import { applyAdminThemeToDocument, clearAdminThemeFromDocument } from '@/lib/admin-theme';

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

  useEffect(() => {
    applyAdminThemeToDocument(theme);

    return () => {
      clearAdminThemeFromDocument();
    };
  }, [theme]);

  if (!getStoredAdminSecret()) {
    return <Navigate to="/" />;
  }

  return (
    <AppShell
      topbar={
        <AdminTopbar
          pathname={pathname}
          theme={theme}
          onThemeToggle={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        />
      }
    >
      <div className="grid gap-8 md:grid-cols-[180px_minmax(0,1fr)]">
        <aside>
          <nav className="flex flex-col gap-1">
            <Link
              to="/home"
              className={
                pathname === '/home'
                  ? 'rounded-sm bg-muted px-3 py-2 text-sm font-medium text-foreground'
                  : 'rounded-sm px-3 py-2 text-sm text-muted-foreground'
              }
            >
              Geral
            </Link>
            <Link
              to="/home/roles"
              className={
                pathname.startsWith('/home/roles')
                  ? 'rounded-sm bg-muted px-3 py-2 text-sm font-medium text-foreground'
                  : 'rounded-sm px-3 py-2 text-sm text-muted-foreground'
              }
            >
              Papéis & Ferramentas
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
