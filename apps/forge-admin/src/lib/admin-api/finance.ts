import { request } from './core';
import type {
  AdminFinance,
  CreateInvestmentInput,
  CreatePayableInput,
  FinanceContractsResponse,
} from './types';

export function getFinance() {
  return request<AdminFinance>('/admin/finance');
}

export function getFinanceContracts() {
  return request<FinanceContractsResponse>('/admin/finance/contracts');
}

export function createInvestment(input: CreateInvestmentInput) {
  return request<{ success: true }>('/admin/finance/investment/create', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createPayable(input: CreatePayableInput) {
  return request<{ kind: 'single' | 'recurring'; entryId: string; payableId?: string }>(
    '/admin/finance/payable/create',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function postPlannedLedgerEntry(entryId: string, effectiveAt?: string) {
  return request<{ entryId: string; status: 'posted'; effectiveAt: number }>('/admin/finance/ledger/post', {
    method: 'POST',
    body: JSON.stringify({ entryId, effectiveAt }),
  });
}

export function cancelPlannedLedgerEntry(entryId: string) {
  return request<{ entryId: string; status: 'canceled' }>('/admin/finance/ledger/cancel', {
    method: 'POST',
    body: JSON.stringify({ entryId }),
  });
}

export function setRecurringPayableActive(payableId: string, isActive: boolean) {
  return request<{ payableId: string; isActive: boolean }>('/admin/finance/recurring-payable/set-active', {
    method: 'POST',
    body: JSON.stringify({ payableId, isActive }),
  });
}
