import { createFileRoute } from '@tanstack/react-router';

import { SystemDetailPage } from '../v1/features/system/page';

export const Route = createFileRoute('/v1/system/llm/profiles')({
  component: SystemLlmProfilesRoute,
});

function SystemLlmProfilesRoute() {
  return <SystemDetailPage section="llm" llmView="profiles" />;
}
