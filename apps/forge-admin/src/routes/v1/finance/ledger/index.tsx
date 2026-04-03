import { createFileRoute } from '@tanstack/react-router';

import { FinanceDetailPage } from '@/v1/features/finance/page';

export const Route = createFileRoute('/v1/finance/ledger/')({
  component: FinanceLedgerRoute,
});

function FinanceLedgerRoute() {
  return <FinanceDetailPage section="ledger" />;
}
