import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/roles')({
  component: Outlet,
});
