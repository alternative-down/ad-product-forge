import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/home/llm/prices')({
  component: HomeLlmPricesLayoutRoute,
});

function HomeLlmPricesLayoutRoute() {
  return <Outlet />;
}
