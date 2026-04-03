import { createFileRoute } from '@tanstack/react-router';

import { SystemDetailPage } from '@/v1/features/system/page';

export const Route = createFileRoute('/v1/system/migrations/')({
  component: SystemMigrationsRoute,
});

function SystemMigrationsRoute() {
  return <SystemDetailPage section="migrations" />;
}
