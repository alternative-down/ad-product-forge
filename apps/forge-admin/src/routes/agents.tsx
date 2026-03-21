import { createFileRoute } from '@tanstack/react-router';

import { AgentsPage, agentsSearchSchema } from '../features/agents/page';

export const Route = createFileRoute('/agents')({
  validateSearch: agentsSearchSchema,
  component: AgentsPage,
});
