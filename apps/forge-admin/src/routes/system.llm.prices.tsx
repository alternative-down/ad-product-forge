import { createFileRoute } from '@tanstack/react-router';

import { SystemDetailPage } from '../features/system/page';

export const Route = createFileRoute('/system/llm/prices')({
  component: _SystemLlmPricesRoute,
});

function _SystemLlmPricesRoute() {
  return <SystemDetailPage section="llm" llmView="prices" />;
}
