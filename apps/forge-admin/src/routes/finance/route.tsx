import { Link, Navigate, Outlet, createFileRoute, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import '../../styles/app.css';
import { AdminTopbar, AppShell } from '@/components/admin';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getStoredAdminSecret, getStoredAdminTheme, setStoredAdminTheme } from '@/lib/admin-secret';
import { applyAdminThemeToDocument, clearAdminThemeFromDocument } from '@/lib/admin-theme';

export const Route = createFileRoute('/finance')({
  component: FinanceLayoutRoute,
});

function FinanceLayoutRoute() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => getStoredAdminTheme());
  const currentSection = pathname === '/finance'
    ? '/finance'
    : pathname === '/finance/accounts'
      ? '/finance/accounts'
      : '/finance/contracts';
  const currentSectionLabel = currentSection === '/finance'
    ? 'Fluxo de caixa'
    : currentSection === '/finance/accounts'
      ? 'Contas a pagar/receber'
      : 'Contratos';

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
              <SelectValue>{currentSectionLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="/finance">Fluxo de caixa</SelectItem>
              <SelectItem value="/finance/accounts">Contas a pagar/receber</SelectItem>
              <SelectItem value="/finance/contracts">Contratos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <aside className="hidden md:block">
          <nav className="flex flex-col gap-1">
            <Link
              to="/finance"
              className={
                pathname === '/finance'
                  ? 'rounded-sm bg-muted px-3 py-2 text-sm font-medium text-foreground'
                  : 'rounded-sm px-3 py-2 text-sm text-muted-foreground'
              }
            >
              Fluxo de caixa
            </Link>
            <Link
              to="/finance/accounts"
              className={
                pathname === '/finance/accounts'
                  ? 'rounded-sm bg-muted px-3 py-2 text-sm font-medium text-foreground'
                  : 'rounded-sm px-3 py-2 text-sm text-muted-foreground'
              }
            >
              Contas a pagar/receber
            </Link>
            <Link
              to="/finance/contracts"
              className={
                pathname === '/finance/contracts'
                  ? 'rounded-sm bg-muted px-3 py-2 text-sm font-medium text-foreground'
                  : 'rounded-sm px-3 py-2 text-sm text-muted-foreground'
              }
            >
              Contratos
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
