import { createFileRoute } from '@tanstack/react-router';

import { AgentHirePage } from '../v1/features/agents/page';

export const Route = createFileRoute('/v1/agents/hire')({
  component: AgentHirePage,
});
