import { createFileRoute } from '@tanstack/react-router';

import { SystemDetailPage } from '../features/system/page';

export const Route = createFileRoute('/system/oauth')({
  component: _SystemOauthRoute,
});

function SystemOauthRoute() {
  return <SystemDetailPage section="auth" />;
}
