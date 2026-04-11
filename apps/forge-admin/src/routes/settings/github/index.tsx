import { createFileRoute } from '@tanstack/react-router';

import { SystemGithubSettingsPage } from '../../integrations/github/index';

export const Route = createFileRoute('/settings/github/')({
  component: SystemGithubSettingsPage,
});
