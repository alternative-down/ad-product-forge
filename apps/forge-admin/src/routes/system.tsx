import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { SystemPage } from '../features/system/page';

const systemSearchSchema = z.object({
  tab: z.enum(['company', 'llm', 'auth', 'integrations', 'migrations']).optional(),
});

export const Route = createFileRoute('/system')({
  validateSearch: systemSearchSchema,
  component: SystemPage,
});
