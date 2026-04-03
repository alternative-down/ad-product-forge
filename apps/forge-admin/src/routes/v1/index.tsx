import { createFileRoute } from '@tanstack/react-router';

import { OverviewPage } from '@/v1/features/overview/page';

export const Route = createFileRoute('/v1/')({
  component: OverviewPage,
});
