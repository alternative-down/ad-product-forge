import { createFileRoute } from '@tanstack/react-router';

import { AppShell } from '../v1/components/layout/app-shell';

export const Route = createFileRoute('/v1')({
  component: AppShell,
});
