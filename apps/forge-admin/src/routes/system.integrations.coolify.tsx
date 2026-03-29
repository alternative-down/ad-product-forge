import { createFileRoute } from '@tanstack/react-router';

import { SystemDetailPage } from '../features/system/page';

export const Route = createFileRoute('/system/integrations/coolify')({
  component: SystemIntegrationsCoolifyRoute,
});

function SystemIntegrationsCoolifyRoute() {
  return <SystemDetailPage section="integrations" integrationView="coolify" />;
}
