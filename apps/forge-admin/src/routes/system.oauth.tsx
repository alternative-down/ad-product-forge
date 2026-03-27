import { createFileRoute } from '@tanstack/react-router';

import { SystemDetailPage } from '../features/system/page';

export const Route = createFileRoute('/system/oauth')({
  component: _SystemOauthRoute,
});

function _SystemOauthRoute() {
  return <SystemDetailPage section="auth" />;
}
