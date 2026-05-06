import { forgeDebug } from '@forge-runtime/core';
import type { CompanyPayablesStore } from '../../finance/company-payables';

export async function getRecurringPayables(payables: CompanyPayablesStore) {
  try {
    return await payables.listRecurringPayables();
  } catch (err) {
    forgeDebug({ scope: 'admin-read-model', level: 'error', message: 'getRecurringPayables failed', context: { error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
}
