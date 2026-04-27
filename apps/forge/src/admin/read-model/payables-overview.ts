import type { CompanyPayablesStore } from '../../finance/company-payables';

export async function getRecurringPayables(payables: CompanyPayablesStore) {
  return payables.listRecurringPayables();
}
