import { createFileRoute } from '@tanstack/react-router';

import { SystemCoolifySettingsPage } from '../../integrations/coolify/index';

export const Route = createFileRoute('/settings/coolify/')({
  component: SystemCoolifySettingsPage,
});
