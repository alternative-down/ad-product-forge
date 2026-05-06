import { forgeDebug } from '@forge-runtime/core';
import type { MicroErpReadModel } from '../../micro-erp/read-model';

export async function getFinanceOverview(finance: MicroErpReadModel) {
  let balance, summary, movements;
  try {
    [balance, summary, movements] = await Promise.all([
      finance.getCompanyCashBalance(),
      finance.getCompanyCashSummary(),
      finance.listCompanyCashMovements({ limit: 50 }),
    ]);
  } catch (err) {
    forgeDebug({ scope: 'admin-read-model', level: 'error', message: 'getFinanceOverview failed', context: { error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }

  return {
    balanceUsd: balance.balanceUsd,
    summary,
    movements,
  };
}
