import { Navigate, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: IndexRedirectRoute,
});

function IndexRedirectRoute() {
  return <Navigate to="/v1" />;
}
