import { createFileRoute } from '@tanstack/react-router';

import { FinanceDetailPage } from '../features/finance/page';

export const Route = createFileRoute('/finance/recurring')({
  component: _FinanceRecurringRoute,
});

function _FinanceRecurringRoute() {
  return <FinanceDetailPage section="recurring" />;
}
