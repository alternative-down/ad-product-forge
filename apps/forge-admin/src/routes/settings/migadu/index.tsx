import { createFileRoute } from '@tanstack/react-router';

import { SystemMigaduSettingsPage } from '../../integrations/migadu/index';

export const Route = createFileRoute('/settings/migadu/')({
  component: SystemMigaduSettingsPage,
});
