import { Link, Navigate, Outlet, createFileRoute, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import '../../styles/app.css';
import { AdminTopbar, AppShell } from '@/components/admin';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getStoredAdminSecret, getStoredAdminTheme, setStoredAdminTheme } from '@/lib/admin-secret';
import { applyAdminThemeToDocument, clearAdminThemeFromDocument } from '@/lib/admin-theme';

export const Route = createFileRoute('/home')({
  component: HomeLayoutRoute,
});

function HomeLayoutRoute() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => getStoredAdminTheme());
  const sectionItems = [
    { value: '/home', label: 'Geral' },
    { value: '/home/conversations', label: 'Conversas' },
    { value: '/home/roles', label: 'Papéis & Ferramentas' },
  ];
  const currentSection = [...sectionItems]
    .sort((left, right) => right.value.length - left.value.length)
    .find((item) => pathname === item.value || pathname.startsWith(`${item.value}/`))
    ?? sectionItems[0];

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
          <Select
            key={pathname}
            value={currentSection.value}
            onValueChange={(value) => void navigate({ to: value })}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{currentSection.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {sectionItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <aside className="hidden md:block">
          <nav className="flex flex-col gap-1">
            {sectionItems.map((item) => (
              <Link
                key={item.value}
                to={item.value}
                className={
                  currentSection.value === item.value
                    ? 'rounded-sm bg-muted px-3 py-2 text-sm font-medium text-foreground'
                    : 'rounded-sm px-3 py-2 text-sm text-muted-foreground'
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </AppShell>
  );
}
