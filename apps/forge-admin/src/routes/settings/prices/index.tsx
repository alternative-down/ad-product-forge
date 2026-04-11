import { createFileRoute } from '@tanstack/react-router';

import { SystemModelPricesPage } from '../../integrations/prices/index';

export const Route = createFileRoute('/settings/prices/')({
  component: SystemModelPricesPage,
});
