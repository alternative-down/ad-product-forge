import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/home/conversations')({
  component: HomeConversationsLayoutRoute,
});

function HomeConversationsLayoutRoute() {
  return <Outlet />;
}
