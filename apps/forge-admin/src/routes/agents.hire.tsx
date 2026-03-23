import { createFileRoute } from '@tanstack/react-router';

import { AgentHirePage } from '../features/agents/page';

export const Route = createFileRoute('/agents/hire')({
  component: AgentHirePage,
});
