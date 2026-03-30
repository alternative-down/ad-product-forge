import { createFileRoute } from '@tanstack/react-router';

import { SystemDetailPage } from '../features/system/page';

export const Route = createFileRoute('/system/integrations/minimax')({
  component: SystemIntegrationsMinimaxRoute,
});

function SystemIntegrationsMinimaxRoute() {
  return <SystemDetailPage section="integrations" integrationView="minimax" />;
}
