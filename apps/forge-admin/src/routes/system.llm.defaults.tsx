import { createFileRoute } from '@tanstack/react-router';

import { SystemDetailPage } from '../features/system/page';

export const Route = createFileRoute('/system/llm/defaults')({
  component: _SystemLlmDefaultsRoute,
});

function _SystemLlmDefaultsRoute() {
  return <SystemDetailPage section="llm" llmView="defaults" />;
}
