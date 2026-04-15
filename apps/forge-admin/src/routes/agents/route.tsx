import { Outlet, createFileRoute, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import { AdminAreaLayout } from '@/components/admin';
import { getAgent } from '@/lib/admin-api';

export const Route = createFileRoute('/agents')({
  component: AgentsLayoutRoute,
});

function AgentsLayoutRoute() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
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
    providerTypes: agentQuery.data?.providers.map((provider) => provider.providerType) ?? [],
  });

  return (
    <AdminAreaLayout sectionItems={sectionItems}>
      <Outlet />
    </AdminAreaLayout>
  );
}

function buildAgentSectionItems(input: {
  agentId: string;
  providerTypes: string[];
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
    { value: `/agents/${input.agentId}/schedules`, label: 'Agendamentos' },
    { value: `/agents/${input.agentId}/conversations`, label: 'Conversas' },
    { value: `/agents/${input.agentId}/notifications`, label: 'Notificações' },
    { value: `/agents/${input.agentId}/mcp`, label: 'MCP' },
    { value: `/agents/${input.agentId}/skills`, label: 'Skills' },
  ];

  for (const providerType of input.providerTypes) {
    if (providerType === 'internal-chat' || providerType === 'github-app') {
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

  items.push({
    value: `/agents/${input.agentId}/github`,
    label: 'Github App',
  });

  items.push({ value: `/agents/${input.agentId}/log`, label: 'Log' });
  items.push({ value: `/agents/${input.agentId}/ltm-log`, label: 'Log LTM' });

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
