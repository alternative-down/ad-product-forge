import { Link, Navigate, Outlet, createFileRoute, useNavigate, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import '../../styles/app.css';
import { AdminTopbar, AppShell } from '@/components/admin';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAgent } from '@/lib/admin-api';
import { getStoredAdminSecret, getStoredAdminTheme, setStoredAdminTheme } from '@/lib/admin-secret';
import { applyAdminThemeToDocument, clearAdminThemeFromDocument } from '@/lib/admin-theme';

export const Route = createFileRoute('/agents')({
  component: AgentsLayoutRoute,
});

function AgentsLayoutRoute() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => getStoredAdminTheme());
  const routeKey = pathname.split('/')[2] ?? '';
  const profileActive = pathname.startsWith('/agents/') && routeKey !== 'roles';
  const agentId = profileActive ? routeKey : '';
  const agentQuery = useQuery({
    queryKey: ['admin', 'agent', agentId],
    queryFn: () => getAgent(agentId),
    enabled: Boolean(agentId),
  });
  const sectionItems = buildAgentSectionItems({
    agentId,
    pathname,
    providerTypes: agentQuery.data?.providers.map((provider) => provider.providerType) ?? [],
    hasGithubProvisioning: Boolean(agentQuery.data?.githubProvisioning),
  });
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
            value={currentSection?.value ?? '/agents'}
            onValueChange={(value) => void navigate({ to: value })}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{currentSection?.label ?? 'Lista'}</SelectValue>
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
                  currentSection?.value === item.value
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

function buildAgentSectionItems(input: {
  agentId: string;
  pathname: string;
  providerTypes: string[];
  hasGithubProvisioning: boolean;
}) {
  if (!input.agentId) {
    return [
      { value: '/agents', label: 'Lista' },
      { value: '/agents/roles', label: 'Papéis & Ferramentas' },
    ];
  }

  const items = [
    { value: `/agents/${input.agentId}`, label: 'Perfil' },
    { value: `/agents/${input.agentId}/contract`, label: 'Contrato' },
    { value: `/agents/${input.agentId}/conversations`, label: 'Conversas' },
    { value: `/agents/${input.agentId}/notifications`, label: 'Notificações' },
  ];

  for (const providerType of input.providerTypes) {
    if (providerType === 'internal-chat') {
      continue;
    }

    if (!items.some((item) => item.value === `/agents/${input.agentId}/providers/${providerType}`)) {
      items.push({
        value: `/agents/${input.agentId}/providers/${providerType}`,
        label: humanizeProviderType(providerType),
      });
    }
  }

  for (const providerType of ['discord', 'email']) {
    if (!items.some((item) => item.value === `/agents/${input.agentId}/providers/${providerType}`)) {
      items.push({
        value: `/agents/${input.agentId}/providers/${providerType}`,
        label: humanizeProviderType(providerType),
      });
    }
  }

  if (input.hasGithubProvisioning) {
    items.push({
      value: `/agents/${input.agentId}/github`,
      label: 'Github',
    });
  }

  items.push({ value: `/agents/${input.agentId}/log`, label: 'Log' });

  return items;
}

function humanizeProviderType(providerType: string) {
  if (providerType === 'internal-chat') {
    return 'Internal Chat';
  }

  if (providerType === 'discord') {
    return 'Discord';
  }

  if (providerType === 'email') {
    return 'Email';
  }

  return providerType;
}
