import { createFileRoute } from '@tanstack/react-router';

import { SystemPage } from '../features/system/page';

export const Route = createFileRoute('/system')({
  component: SystemPage,
});
