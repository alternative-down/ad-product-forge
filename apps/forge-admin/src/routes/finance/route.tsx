import { Outlet, createFileRoute } from '@tanstack/react-router';

import { AdminAreaLayout } from '@/components/admin';

export const Route = createFileRoute('/finance')({
  component: FinanceLayoutRoute,
});

function FinanceLayoutRoute() {
  const sectionItems = [
    { value: '/finance', label: 'Fluxo de caixa' },
    { value: '/finance/accounts', label: 'Contas a pagar/receber' },
    { value: '/finance/contracts', label: 'Contratos' },
  ];

  return (
    <AdminAreaLayout sectionItems={sectionItems}>
      <Outlet />
    </AdminAreaLayout>
  );
}
