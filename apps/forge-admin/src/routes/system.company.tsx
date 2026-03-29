import { createFileRoute } from '@tanstack/react-router';

import { SystemDetailPage } from '../features/system/page';

export const Route = createFileRoute('/system/company')({
  component: SystemCompanyRoute,
});

function SystemCompanyRoute() {
  return <SystemDetailPage section="company" />;
}
