import { createFileRoute } from '@tanstack/react-router';

import { SystemDetailPage } from '../v1/features/system/page';

export const Route = createFileRoute('/v1/system/llm/defaults')({
  component: SystemLlmDefaultsRoute,
});

function SystemLlmDefaultsRoute() {
  return <SystemDetailPage section="llm" llmView="defaults" />;
}
