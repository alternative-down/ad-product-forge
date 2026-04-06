import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/agents/$agentId/providers/$providerType')({
  beforeLoad: ({ params }) => {
    if (params.providerType === 'github-app') {
      throw redirect({
        to: '/agents/$agentId/github',
        params: {
          agentId: params.agentId,
        },
      });
    }

    if (params.providerType !== 'discord' && params.providerType !== 'email') {
      throw redirect({
        to: '/agents/$agentId',
        params: {
          agentId: params.agentId,
        },
      });
    }
  },
  component: AgentProviderLayoutRoute,
});

function AgentProviderLayoutRoute() {
  return <Outlet />;
}
