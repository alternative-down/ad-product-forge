import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/home/roles')({
  component: HomeRolesLayoutRoute,
});

function HomeRolesLayoutRoute() {
  return <Outlet />;
}
