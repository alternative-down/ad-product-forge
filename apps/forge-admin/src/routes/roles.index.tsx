import { createFileRoute } from '@tanstack/react-router';

import { RolesPage } from '../features/roles/page';

export const Route = createFileRoute('/roles/')({
  component: RolesPage,
});
