import { createFileRoute } from '@tanstack/react-router';

import { FinanceDetailPage } from '../features/finance/page';

export const Route = createFileRoute('/finance/ledger')({
  component: _FinanceLedgerRoute,
});

function _FinanceLedgerRoute() {
  return <FinanceDetailPage section="ledger" />;
}
