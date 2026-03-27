import { createFileRoute } from '@tanstack/react-router';

import { SystemDetailPage } from '../features/system/page';

export const Route = createFileRoute('/system/migrations')({
  component: _SystemMigrationsRoute,
});

function _SystemMigrationsRoute() {
  return <SystemDetailPage section="migrations" />;
}
