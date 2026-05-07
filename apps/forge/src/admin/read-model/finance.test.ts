import { describe, expect, test, vi, beforeEach } from 'vitest';

// =============================================================================
// Mock finance store (micro-erp read model)
// =============================================================================

const mockFinance = vi.hoisted(() => ({
  getCompanyCashBalance: vi.fn().mockResolvedValue({ balanceUsd: 1000 }),
  getCompanyCashSummary: vi.fn().mockResolvedValue({ totalIn: 500, totalOut: 200 }),
  listCompanyCashMovements: vi.fn().mockResolvedValue({
    items: [
      {
        id: 'mv-1',
        direction: 'in' as const,
        amountUsd: 500,
        status: 'posted' as const,
        createdAt: Date.now(),
      },
    ],
    total: 1,
    summary: { totalIn: 500, totalOut: 200 },
  }),
  listActiveInternalAgentContracts: vi.fn(),
}));

vi.mock('../../micro-erp/read-model', () => ({
  createMicroErpReadModel: vi.fn(() => mockFinance),
}));

vi.mock('../../finance/company-payables', () => ({
  createCompanyPayables: vi.fn(() => ({
    listRecurringPayables: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
  })),
}));

import { createFinanceReadModel } from './finance';

import type {Database} from '../../database/schema';

// =============================================================================
// Test helpers
// =============================================================================

function makeMockDb() {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    }),
    query: { agentExecutionSteps: { findMany: vi.fn().mockResolvedValue([]) } },
  } as unknown as Database;
}

// =============================================================================
// createFinanceReadModel — getFinance
// =============================================================================

describe('createFinanceReadModel getFinance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFinance.getCompanyCashBalance.mockResolvedValue({ balanceUsd: 1000 });
    mockFinance.getCompanyCashSummary.mockResolvedValue({ totalIn: 500, totalOut: 200 });
    mockFinance.listCompanyCashMovements.mockResolvedValue({
      items: [],
      total: 0,
      summary: { totalIn: 500, totalOut: 200 },
    });
  });

  test('returns balance, summary, movements, and recurringPayables', async () => {
    const store = createFinanceReadModel({ db: {} as Database });
    const result = await store.getFinance();

    expect(result).toHaveProperty('balanceUsd');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('movements');
    expect(result).toHaveProperty('recurringPayables');
  });

  test('calls microErp finance methods in parallel via Promise.all', async () => {
    mockFinance.getCompanyCashBalance.mockResolvedValue({ balanceUsd: 2000 });
    mockFinance.getCompanyCashSummary.mockResolvedValue({ totalIn: 1000, totalOut: 500 });
    mockFinance.listCompanyCashMovements.mockResolvedValue({
      items: [{ id: 'm1' }],
      total: 1,
      summary: { totalIn: 1000, totalOut: 500 },
    });

    const store = createFinanceReadModel({ db: {} as Database });
    await store.getFinance();

    expect(mockFinance.getCompanyCashBalance).toHaveBeenCalled();
    expect(mockFinance.getCompanyCashSummary).toHaveBeenCalled();
    expect(mockFinance.listCompanyCashMovements).toHaveBeenCalledWith({ limit: 50 });
  });

  test('includes recurring payables from payables store', async () => {
    const store = createFinanceReadModel({ db: {} as Database });
    const result = await store.getFinance();

    expect(result.recurringPayables).toBeDefined();
    expect(Array.isArray(result.recurringPayables.items)).toBe(true);
    expect(result.recurringPayables).toHaveProperty('hasMore');
  });
});

// =============================================================================
// createFinanceReadModel — getFinanceContracts
// =============================================================================

describe('createFinanceReadModel getFinanceContracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns { items, hasMore } shape — items is an array, not the response itself', async () => {
    mockFinance.listActiveInternalAgentContracts.mockResolvedValue({
      items: [
        {
          contractId: 'c1',
          agentId: 'a1',
          agentName: 'Alice',
          weeklyValueUsd: 100,
          autoRenew: false,
          startsAt: Date.now() - 86400000,
          endsAt: Date.now() + 518400000,
        },
      ],
    });
    const db = makeMockDb();
    const store = createFinanceReadModel({ db });
    const result = await store.getFinanceContracts();

    // Shape must match FinanceContractsResponse used by Admin UI
    expect(result).toHaveProperty('items');
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toHaveProperty('contractId');
    expect(result.items[0]).toHaveProperty('agentName');
  });

  test('hasMore is present and false by default (no pagination)', async () => {
    mockFinance.listActiveInternalAgentContracts.mockResolvedValue({ items: [] });
    const db = makeMockDb();
    const store = createFinanceReadModel({ db });
    const result = await store.getFinanceContracts();

    expect(result).toHaveProperty('hasMore');
    expect(result.hasMore).toBe(false);
  });

  test('adds spentUsd and spentPercent to each contract from agent_execution_steps', async () => {
    mockFinance.listActiveInternalAgentContracts.mockResolvedValue({
      items: [
        {
          contractId: 'c1',
          agentId: 'a1',
          agentName: 'Bob',
          weeklyValueUsd: 200,
          autoRenew: true,
          startsAt: Date.now(),
          endsAt: Date.now() + 518400000,
        },
      ],
    });
    const mockAll = vi.fn().mockResolvedValue([{ contractId: 'c1', total: 50 }]);
    const db = makeMockDb();
    db.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockReturnValue({ all: mockAll }),
        }),
      }),
    });

    const store = createFinanceReadModel({ db });
    const result = await store.getFinanceContracts();

    expect(result.items[0].spentUsd).toBe(50);
    expect(result.items[0].spentPercent).toBe(25); // 50/200 * 100
  });

  test('contracts with no execution steps have spentUsd: 0', async () => {
    mockFinance.listActiveInternalAgentContracts.mockResolvedValue({
      items: [
        {
          contractId: 'c2',
          agentId: 'a2',
          agentName: 'Carol',
          weeklyValueUsd: 150,
          autoRenew: false,
          startsAt: Date.now(),
          endsAt: Date.now() + 518400000,
        },
      ],
    });
    const db = makeMockDb();
    db.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    });

    const store = createFinanceReadModel({ db });
    const result = await store.getFinanceContracts();

    expect(result.items[0].spentUsd).toBe(0);
    expect(result.items[0].spentPercent).toBe(0);
  });

  test('spentPercent is 0 when weeklyValueUsd is 0 — no division by zero', async () => {
    mockFinance.listActiveInternalAgentContracts.mockResolvedValue({
      items: [
        {
          contractId: 'c3',
          agentId: 'a3',
          agentName: 'Dave',
          weeklyValueUsd: 0,
          autoRenew: false,
          startsAt: Date.now(),
          endsAt: Date.now() + 518400000,
        },
      ],
    });
    const db = makeMockDb();
    db.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    });

    const store = createFinanceReadModel({ db });
    const result = await store.getFinanceContracts();

    expect(result.items[0].spentPercent).toBe(0);
  });

  test('returns empty items array and hasMore: false when no active contracts', async () => {
    mockFinance.listActiveInternalAgentContracts.mockResolvedValue({ items: [] });
    const db = makeMockDb();
    const store = createFinanceReadModel({ db });
    const result = await store.getFinanceContracts();

    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });
});

// =============================================================================
// getFinanceOverview (standalone)
// =============================================================================

describe('getFinanceOverview (standalone)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFinance.getCompanyCashBalance.mockResolvedValue({ balanceUsd: 2000 });
    mockFinance.getCompanyCashSummary.mockResolvedValue({ totalIn: 1000, totalOut: 500 });
    mockFinance.listCompanyCashMovements.mockResolvedValue({
      items: [{ id: 'm1', amountUsd: 100, direction: 'in' as const, status: 'posted' as const }],
      total: 1,
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

// =============================================================================
// getRecurringPayables (standalone)
// =============================================================================

describe('getRecurringPayables (standalone)', () => {
  test('returns recurring payables from payables store', async () => {
    const mockPayablesStore = {
      listRecurringPayables: vi.fn().mockResolvedValue({
        items: [{ id: 'r1', description: 'Rent', amountUsd: 1000 }],
        hasMore: true,
      }),
    };

    const { getRecurringPayables } = await import('./payables-overview');
    const result = await getRecurringPayables(mockPayablesStore as any);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('r1');
    expect(result.hasMore).toBe(true);
  });

  test('returns empty when no recurring payables', async () => {
    const mockPayablesStore = {
      listRecurringPayables: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
    };

    const { getRecurringPayables } = await import('./payables-overview');
    const result = await getRecurringPayables(mockPayablesStore as any);

    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });
});