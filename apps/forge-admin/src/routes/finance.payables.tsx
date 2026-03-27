import { createFileRoute } from '@tanstack/react-router';

import { FinanceDetailPage } from '../features/finance/page';

export const Route = createFileRoute('/finance/payables')({
  component: _FinancePayablesRoute,
});

function _FinancePayablesRoute() {
  return <FinanceDetailPage section="payables" />;
}
