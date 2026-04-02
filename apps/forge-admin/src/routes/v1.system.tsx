import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/v1/system')({
  component: Outlet,
});
