import { createFileRoute } from '@tanstack/react-router';

import { RolesPage } from '@/v1/features/roles/page';

export const Route = createFileRoute('/v1/roles/')({
  component: RolesPage,
});
