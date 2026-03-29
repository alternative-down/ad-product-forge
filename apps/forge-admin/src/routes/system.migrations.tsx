import { createFileRoute } from '@tanstack/react-router';

import { SystemDetailPage } from '../features/system/page';

export const Route = createFileRoute('/system/migrations')({
  component: SystemMigrationsRoute,
});

function SystemMigrationsRoute() {
  return <SystemDetailPage section="migrations" />;
}
