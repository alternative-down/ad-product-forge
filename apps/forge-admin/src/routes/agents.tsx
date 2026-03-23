import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { AgentsPage } from '../features/agents/page';

const agentsSearchSchema = z.object({
  agentId: z.string().optional(),
  tab: z.enum(['hire', 'runtime', 'communications', 'schedules', 'history']).optional(),
});

export const Route = createFileRoute('/agents')({
  validateSearch: agentsSearchSchema,
  component: AgentsPage,
});
