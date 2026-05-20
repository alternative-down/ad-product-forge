import type { MicroErpReadModel } from '../../micro-erp/read-model';

export async function getFinanceOverview(finance: MicroErpReadModel) {
  const [balance, summary, movements] = await Promise.all([
      finance.getCompanyCashBalance(),
      finance.getCompanyCashSummary(),
      finance.listCompanyCashMovements({ limit: 50 }),
    ]);

  return {
    balanceUsd: balance.balanceUsd,
    summary,
    movements,
  };
}
