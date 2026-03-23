import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { AgentDetailPage } from '../features/agents/page';

export const Route = createFileRoute('/agents/$agentId/runtime/$runtimeView')({
  params: {
    parse: (input) =>
      z
        .object({
          agentId: z.string(),
          runtimeView: z.enum(['assignment', 'configuration', 'contract', 'github']),
        })
        .parse(input),
  },
  component: AgentRuntimeRoute,
});

function AgentRuntimeRoute() {
  const params = Route.useParams();

  return <AgentDetailPage agentId={params.agentId} tab="runtime" runtimeView={params.runtimeView} />;
}
