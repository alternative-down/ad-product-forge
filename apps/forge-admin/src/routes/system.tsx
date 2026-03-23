import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { SystemPage } from '../features/system/page';

const systemSearchSchema = z.object({
  tab: z.enum(['company', 'llm', 'auth', 'integrations', 'migrations']).optional(),
  llmView: z.enum(['defaults', 'profiles', 'prices']).optional(),
  integrationView: z.enum(['migadu', 'coolify', 'github']).optional(),
});

export const Route = createFileRoute('/system')({
  validateSearch: systemSearchSchema,
  component: SystemPage,
});
