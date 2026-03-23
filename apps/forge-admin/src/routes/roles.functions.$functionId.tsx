import { createFileRoute } from '@tanstack/react-router';

import { FunctionDetailPage } from '../features/roles/page';

export const Route = createFileRoute('/roles/functions/$functionId')({
  component: RolesFunctionRoute,
});

function RolesFunctionRoute() {
  const params = Route.useParams();

  return <FunctionDetailPage functionId={params.functionId} />;
}
