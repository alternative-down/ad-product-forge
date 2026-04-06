import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/finance/accounts')({
  component: FinanceAccountsLayoutRoute,
});

function FinanceAccountsLayoutRoute() {
  return <Outlet />;
}
