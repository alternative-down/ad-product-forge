import { createFileRoute } from '@tanstack/react-router';

import { SystemDetailPage } from '../v1/features/system/page';

export const Route = createFileRoute('/v1/system/integrations/minimax')({
  component: SystemIntegrationsMinimaxRoute,
});

function SystemIntegrationsMinimaxRoute() {
  return <SystemDetailPage section="integrations" integrationView="minimax" />;
}
