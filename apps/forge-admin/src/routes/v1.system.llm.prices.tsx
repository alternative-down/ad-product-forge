import { createFileRoute } from '@tanstack/react-router';

import { SystemDetailPage } from '../v1/features/system/page';

export const Route = createFileRoute('/v1/system/llm/prices')({
  component: SystemLlmPricesRoute,
});

function SystemLlmPricesRoute() {
  return <SystemDetailPage section="llm" llmView="prices" />;
}
