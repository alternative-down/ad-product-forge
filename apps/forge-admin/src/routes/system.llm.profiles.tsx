import { createFileRoute } from '@tanstack/react-router';

import { SystemDetailPage } from '../features/system/page';

export const Route = createFileRoute('/system/llm/profiles')({
  component: SystemLlmProfilesRoute,
});

function SystemLlmProfilesRoute() {
  return <SystemDetailPage section="llm" llmView="profiles" />;
}
