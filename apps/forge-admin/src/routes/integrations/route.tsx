import { Link, Navigate, Outlet, createFileRoute, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import '../../styles/app.css';
import { AdminTopbar, AppShell } from '@/components/admin';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getStoredAdminSecret, getStoredAdminTheme, setStoredAdminTheme } from '@/lib/admin-secret';
import { applyAdminThemeToDocument, clearAdminThemeFromDocument } from '@/lib/admin-theme';

export const Route = createFileRoute('/integrations')({
  component: IntegrationsLayoutRoute,
});

function IntegrationsLayoutRoute() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => getStoredAdminTheme());
  const currentSection = pathname === '/integrations'
    ? '/integrations'
    : pathname === '/integrations/prices'
      ? '/integrations/prices'
      : pathname === '/integrations/github'
        ? '/integrations/github'
        : pathname === '/integrations/coolify'
          ? '/integrations/coolify'
          : pathname === '/integrations/migadu'
            ? '/integrations/migadu'
            : '/integrations/minimax';

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
      <div className="space-y-6 md:grid md:grid-cols-[180px_minmax(0,1fr)] md:gap-8 md:space-y-0">
        <div className="md:hidden">
          <Select value={currentSection} onValueChange={(value) => void navigate({ to: value })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="/integrations">Perfis</SelectItem>
              <SelectItem value="/integrations/prices">Preços</SelectItem>
              <SelectItem value="/integrations/github">Github</SelectItem>
              <SelectItem value="/integrations/coolify">Coolify</SelectItem>
              <SelectItem value="/integrations/migadu">Migadu</SelectItem>
              <SelectItem value="/integrations/minimax">MiniMax</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <aside className="hidden md:block">
          <nav className="flex flex-col gap-1">
            <Link
              to="/integrations"
              className={
                pathname === '/integrations'
                  ? 'rounded-sm bg-muted px-3 py-2 text-sm font-medium text-foreground'
                  : 'rounded-sm px-3 py-2 text-sm text-muted-foreground'
              }
            >
              Perfis
            </Link>
            <Link
              to="/integrations/prices"
              className={
                pathname === '/integrations/prices'
                  ? 'rounded-sm bg-muted px-3 py-2 text-sm font-medium text-foreground'
                  : 'rounded-sm px-3 py-2 text-sm text-muted-foreground'
              }
            >
              Preços
            </Link>
            <Link
              to="/integrations/github"
              className={
                pathname === '/integrations/github'
                  ? 'rounded-sm bg-muted px-3 py-2 text-sm font-medium text-foreground'
                  : 'rounded-sm px-3 py-2 text-sm text-muted-foreground'
              }
            >
              Github
            </Link>
            <Link
              to="/integrations/coolify"
              className={
                pathname === '/integrations/coolify'
                  ? 'rounded-sm bg-muted px-3 py-2 text-sm font-medium text-foreground'
                  : 'rounded-sm px-3 py-2 text-sm text-muted-foreground'
              }
            >
              Coolify
            </Link>
            <Link
              to="/integrations/migadu"
              className={
                pathname === '/integrations/migadu'
                  ? 'rounded-sm bg-muted px-3 py-2 text-sm font-medium text-foreground'
                  : 'rounded-sm px-3 py-2 text-sm text-muted-foreground'
              }
            >
              Migadu
            </Link>
            <Link
              to="/integrations/minimax"
              className={
                pathname === '/integrations/minimax'
                  ? 'rounded-sm bg-muted px-3 py-2 text-sm font-medium text-foreground'
                  : 'rounded-sm px-3 py-2 text-sm text-muted-foreground'
              }
            >
              MiniMax
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
