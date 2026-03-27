import { createFileRoute } from '@tanstack/react-router';

import { SystemDetailPage } from '../features/system/page';

export const Route = createFileRoute('/system/integrations/github')({
  component: _SystemIntegrationsGithubRoute,
});

function _SystemIntegrationsGithubRoute() {
  return <SystemDetailPage section="integrations" integrationView="github" />;
}
