import { createFileRoute } from '@tanstack/react-router';

import { FinancePage } from '@/v1/features/finance/page';

export const Route = createFileRoute('/v1/finance/')({
  component: FinancePage,
});
