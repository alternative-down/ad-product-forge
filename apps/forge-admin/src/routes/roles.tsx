import { createFileRoute } from '@tanstack/react-router';

import { RolesPage, rolesSearchSchema } from '../features/roles/page';

export const Route = createFileRoute('/roles')({
  validateSearch: rolesSearchSchema,
  component: RolesPage,
});
