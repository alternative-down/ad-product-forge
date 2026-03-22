import { createFileRoute } from '@tanstack/react-router';

import { FinancePage } from '../features/finance/page';

export const Route = createFileRoute('/finance')({
  component: FinancePage,
});
