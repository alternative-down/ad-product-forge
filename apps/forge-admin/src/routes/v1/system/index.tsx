import { createFileRoute } from '@tanstack/react-router';

import { SystemPage } from '@/v1/features/system/page';

export const Route = createFileRoute('/v1/system/')({
  component: SystemPage,
});
