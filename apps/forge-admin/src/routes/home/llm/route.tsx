import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/home/llm')({
  component: HomeLlmLayoutRoute,
});

function HomeLlmLayoutRoute() {
  return <Outlet />;
}
