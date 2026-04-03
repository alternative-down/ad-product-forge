import { createFileRoute } from '@tanstack/react-router';

import { SystemDetailPage } from '@/v1/features/system/page';

export const Route = createFileRoute('/v1/system/integrations/coolify/')({
  component: SystemIntegrationsCoolifyRoute,
});

function SystemIntegrationsCoolifyRoute() {
  return <SystemDetailPage section="integrations" integrationView="coolify" />;
}
