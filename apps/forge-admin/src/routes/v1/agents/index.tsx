import { createFileRoute } from '@tanstack/react-router';

import { AgentsPage } from '@/v1/features/agents/page';

export const Route = createFileRoute('/v1/agents/')({
  component: AgentsPage,
});
