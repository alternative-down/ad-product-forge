import { createFileRoute } from '@tanstack/react-router';

import { FinanceDetailPage } from '../v1/features/finance/page';

export const Route = createFileRoute('/v1/finance/capital')({
  component: FinanceCapitalRoute,
});

function FinanceCapitalRoute() {
  return <FinanceDetailPage section="capital" />;
}
