import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { RolesPage } from '../features/roles/page';

const rolesSearchSchema = z.object({
  roleId: z.string().optional(),
  tab: z.enum(['roles', 'functions']).optional(),
});

export const Route = createFileRoute('/roles')({
  validateSearch: rolesSearchSchema,
  component: RolesPage,
});
