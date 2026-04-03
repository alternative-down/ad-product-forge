import { createFileRoute } from '@tanstack/react-router';

import { PageHeader } from '@/components/admin';

export const Route = createFileRoute('/finance/contracts/')({
  component: FinanceContractsIndexRoute,
});

function FinanceContractsIndexRoute() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader title="Contratos" />
    </div>
  );
}
