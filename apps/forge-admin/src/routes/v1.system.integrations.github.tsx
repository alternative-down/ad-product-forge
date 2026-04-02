import { createFileRoute } from '@tanstack/react-router';

import { SystemDetailPage } from '../v1/features/system/page';

export const Route = createFileRoute('/v1/system/integrations/github')({
  component: SystemIntegrationsGithubRoute,
});

function SystemIntegrationsGithubRoute() {
  return <SystemDetailPage section="integrations" integrationView="github" />;
}
