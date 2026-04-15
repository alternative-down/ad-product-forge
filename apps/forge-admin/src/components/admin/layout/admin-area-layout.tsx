import { Link, Navigate, useNavigate, useRouterState } from '@tanstack/react-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import '../../../styles/app.css';
import { getStoredAdminSecret, getStoredAdminTheme, setStoredAdminTheme } from '@/lib/admin-secret';
import { applyAdminThemeToDocument, clearAdminThemeFromDocument } from '@/lib/admin-theme';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { AppShell } from './app-shell';
import { AdminTopbar } from './admin-topbar';

export type AdminAreaSectionItem = {
  value: string;
  label: string;
};

export function AdminAreaLayout(input: {
  sectionItems: AdminAreaSectionItem[];
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => getStoredAdminTheme());
  const currentSection = useMemo(
    () => findCurrentSection(pathname, input.sectionItems),
    [input.sectionItems, pathname],
  );

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
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:grid md:grid-cols-[170px_minmax(0,1fr)] md:gap-6 md:space-y-0">
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
              {input.sectionItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <aside className="hidden md:block">
          <nav className="flex flex-col gap-1">
            {input.sectionItems.map((item) => (
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
        <div className="flex min-h-0 min-w-0 flex-col">{input.children}</div>
      </div>
    </AppShell>
  );
}

function findCurrentSection(pathname: string, sectionItems: AdminAreaSectionItem[]) {
  return (
    [...sectionItems]
      .sort((left, right) => right.value.length - left.value.length)
      .find((item) => pathname === item.value || pathname.startsWith(`${item.value}/`))
    ?? sectionItems[0]
  );
}
