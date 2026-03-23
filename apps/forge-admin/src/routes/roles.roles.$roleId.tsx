import { createFileRoute } from '@tanstack/react-router';

import { RoleDetailPage } from '../features/roles/page';

export const Route = createFileRoute('/roles/roles/$roleId')({
  component: RolesRoleRoute,
});

function RolesRoleRoute() {
  const params = Route.useParams();

  return <RoleDetailPage roleId={params.roleId} />;
}
