import { createFileRoute } from '@tanstack/react-router';

import { SystemMinimaxSettingsPage } from '../../integrations/minimax/index';

export const Route = createFileRoute('/settings/minimax/')({
  component: SystemMinimaxSettingsPage,
});
