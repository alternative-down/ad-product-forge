import { createFileRoute } from '@tanstack/react-router';

import { HiringWizardPage } from '../features/agents/hiring-wizard/hiring-wizard-page';

export const Route = createFileRoute('/agents/hire')({
  component: HiringWizardPage,
});
