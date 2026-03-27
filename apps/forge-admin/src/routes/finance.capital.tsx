import { createFileRoute } from '@tanstack/react-router';

import { FinanceDetailPage } from '../features/finance/page';

export const Route = createFileRoute('/finance/capital')({
  component: _FinanceCapitalRoute,
});

function _FinanceCapitalRoute() {
  return <FinanceDetailPage section="capital" />;
}
