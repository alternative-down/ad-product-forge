import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { AgentDetailPage } from '@/v1/features/agents/page';

export const Route = createFileRoute('/v1/agents/$agentId/communications/$communicationView/')({
  params: {
    parse: (input) =>
      z
        .object({
          agentId: z.string(),
          communicationView: z.enum(['providers', 'inbox', 'thread']),
        })
        .parse(input),
  },
  component: AgentCommunicationsRoute,
});

function AgentCommunicationsRoute() {
  const params = Route.useParams();

  return (
    <AgentDetailPage
      agentId={params.agentId}
      tab="communications"
      communicationView={params.communicationView}
    />
  );
}
