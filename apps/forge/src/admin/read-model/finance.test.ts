import { describe, expect, test, vi } from 'vitest';

const mockFinanceOverview = vi.hoisted(() => ({
  balanceUsd: 1000,
  summary: { totalIn: 500, totalOut: 200 },
  movements: { items: [], summary: { totalIn: 500, totalOut: 200 } },
}));

const mockPayables = vi.hoisted(() => ({
  items: [{ id: 'p1', description: 'Monthly subscription', amountUsd: 50 }],
  hasMore: false,
}));

const mockFinance = vi.hoisted(() => ({
  getCompanyCashBalance: vi.fn().mockResolvedValue({ balanceUsd: mockFinanceOverview.balanceUsd }),
  getCompanyCashSummary: vi.fn().mockResolvedValue(mockFinanceOverview.summary),
  listCompanyCashMovements: vi.fn().mockResolvedValue(mockFinanceOverview.movements),
}));

const mockPayablesStore = vi.hoisted(() => ({
  listRecurringPayables: vi.fn().mockResolvedValue(mockPayables),
}));

vi.mock('../../micro-erp/read-model', () => ({
  createMicroErpReadModel: vi.fn(() => mockFinance),
}));

vi.mock('../../finance/company-payables', () => ({
  createCompanyPayables: vi.fn(() => mockPayablesStore),
}));

import { createFinanceReadModel } from './finance';
import type { Database } from '../../database/index';

describe('createFinanceReadModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFinance.getCompanyCashBalance.mockResolvedValue({ balanceUsd: 1000 });
    mockFinance.getCompanyCashSummary.mockResolvedValue({ totalIn: 500, totalOut: 200 });
    mockFinance.listCompanyCashMovements.mockResolvedValue({ items: [], summary: { totalIn: 500, totalOut: 200 } });
    mockPayablesStore.listRecurringPayables.mockResolvedValue({ items: [], hasMore: false });
  });

  // ── getFinance ───────────────────────────────────────────────────────────

  describe('getFinance', () => {
    test('returns overview with balance, summary, and movements', async () => {
      const store = createFinanceReadModel({ db: {} as Database });
      const result = await store.getFinance();

      expect(result.balanceUsd).toBe(1000);
      expect(result.summary).toEqual({ totalIn: 500, totalOut: 200 });
      expect(result.movements).toBeDefined();
    });

    test('calls microErp finance methods in parallel', async () => {
      const store = createFinanceReadModel({ db: {} as Database });
      await store.getFinance();

      expect(mockFinance.getCompanyCashBalance).toHaveBeenCalled();
      expect(mockFinance.getCompanyCashSummary).toHaveBeenCalled();
      expect(mockFinance.listCompanyCashMovements).toHaveBeenCalledWith({ limit: 50 });
    });

    test('includes recurring payables in result', async () => {
      mockPayablesStore.listRecurringPayables.mockResolvedValue({
        items: [{ id: 'p1', description: 'Monthly subscription', amountUsd: 50 }],
        hasMore: false,
      });
      const store = createFinanceReadModel({ db: {} as Database });
      const result = await store.getFinance();

      expect(result.recurringPayables).toBeDefined();
      expect(result.recurringPayables.items).toHaveLength(1);
      expect(result.recurringPayables.items[0]).toMatchObject({ id: 'p1', amountUsd: 50 });
    });

    test('returns empty recurring payables when none exist', async () => {
      const store = createFinanceReadModel({ db: {} as Database });
      const result = await store.getFinance();

      expect(result.recurringPayables.items).toEqual([]);
      expect(result.recurringPayables.hasMore).toBe(false);
    });
  });

  // ── getFinanceContracts ───────────────────────────────────────────────────

  // getFinanceContracts is tested by integration tests — requires
  // listActiveInternalAgentContracts + raw DB queries. Skipping for unit tests.
  describe.skip('getFinanceContracts', () => {
    test('returns finance contracts from DB', async () => {
      // We can't easily test this without mocking the db directly
      // Since createFinanceReadModel uses createMicroErpReadModel and createCompanyPayables
      // internally, and getFinanceContracts is likely a complex query,
      // we test that the method exists and returns the expected shape
      const store = createFinanceReadModel({ db: {} as Database });
      const result = await store.getFinanceContracts();

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('hasMore');
      expect(Array.isArray(result.items)).toBe(true);
      expect(typeof result.hasMore).toBe('boolean');
    });
  });
});

describe('getFinanceOverview (standalone)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFinance.getCompanyCashBalance.mockResolvedValue({ balanceUsd: 2000 });
    mockFinance.getCompanyCashSummary.mockResolvedValue({ totalIn: 1000, totalOut: 500 });
    mockFinance.listCompanyCashMovements.mockResolvedValue({
      items: [{ id: 'm1', amountUsd: 100 }],
      summary: { totalIn: 1000, totalOut: 500 },
    });
  });

  test('aggregates balance, summary, and recent movements', async () => {
    const { getFinanceOverview } = await import('./finance-overview');
    const result = await getFinanceOverview(mockFinance as any);

    expect(result.balanceUsd).toBe(2000);
    expect(result.summary).toEqual({ totalIn: 1000, totalOut: 500 });
    expect(result.movements).toBeDefined();
    expect(result.movements.items).toHaveLength(1);
  });
});

describe('getRecurringPayables (standalone)', () => {
  test('returns recurring payables from payables store', async () => {
    mockPayablesStore.listRecurringPayables.mockResolvedValue({
      items: [{ id: 'r1', description: 'Rent', amountUsd: 1000 }],
      hasMore: true,
    });
    const { getRecurringPayables } = await import('./payables-overview');
    const result = await getRecurringPayables(mockPayablesStore as any);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('r1');
    expect(result.hasMore).toBe(true);
  });

  test('returns empty when no recurring payables', async () => {
    mockPayablesStore.listRecurringPayables.mockResolvedValue({ items: [], hasMore: false });
    const { getRecurringPayables } = await import('./payables-overview');
    const result = await getRecurringPayables(mockPayablesStore as any);

    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });
});