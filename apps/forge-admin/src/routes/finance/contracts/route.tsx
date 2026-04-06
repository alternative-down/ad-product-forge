import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/finance/contracts')({
  component: FinanceContractsLayoutRoute,
});

function FinanceContractsLayoutRoute() {
  return <Outlet />;
}
