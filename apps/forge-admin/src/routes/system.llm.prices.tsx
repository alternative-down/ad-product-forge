import { createFileRoute } from '@tanstack/react-router';

import { SystemDetailPage } from '../features/system/page';

export const Route = createFileRoute('/system/llm/prices')({
  component: SystemLlmPricesRoute,
});

function SystemLlmPricesRoute() {
  return <SystemDetailPage section="llm" llmView="prices" />;
}
