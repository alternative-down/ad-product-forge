import { createFileRoute } from '@tanstack/react-router';

import { SystemDetailPage } from '../features/system/page';

export const Route = createFileRoute('/system/company')({
  component: _SystemCompanyRoute,
});

function _SystemCompanyRoute() {
  return <SystemDetailPage section="company" />;
}
