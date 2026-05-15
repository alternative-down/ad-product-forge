import type { CompanyPayablesStore } from '../../finance/company-payables';

export async function getRecurringPayables(payables: CompanyPayablesStore) {
    return await payables.listRecurringPayables();
}
