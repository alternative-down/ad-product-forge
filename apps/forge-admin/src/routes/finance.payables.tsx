import { createFileRoute } from '@tanstack/react-router';

import { FinanceDetailPage } from '../features/finance/page';

export const Route = createFileRoute('/finance/payables')({
  component: FinancePayablesRoute,
});

function FinancePayablesRoute() {
  return <FinanceDetailPage section="payables" />;
}
