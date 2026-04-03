import { createFileRoute } from '@tanstack/react-router';

import { RoleDetailPage } from '@/v1/features/roles/page';

export const Route = createFileRoute('/v1/roles/roles/$roleId/')({
  component: RolesRoleRoute,
});

function RolesRoleRoute() {
  const params = Route.useParams();

  return <RoleDetailPage roleId={params.roleId} />;
}
