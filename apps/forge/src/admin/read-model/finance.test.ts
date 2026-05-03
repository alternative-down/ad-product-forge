import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock finance store
const mockFinance = vi.hoisted(() => ({
  getCompanyCashBalance: vi.fn().mockResolvedValue({ balanceUsd: 1000 }),
  getCompanyCashSummary: vi.fn().mockResolvedValue({ totalIn: 500, totalOut: 200 }),
  listCompanyCashMovements: vi.fn().mockResolvedValue({ items: [], summary: {} }),
  listActiveInternalAgentContracts: vi.fn(),
}));

vi.mock('../../micro-erp/read-model', () => ({
  createMicroErpReadModel: vi.fn(() => mockFinance),
}));

vi.mock('../../finance/company-payables', () => ({
  createCompanyPayables: vi.fn(() => ({ listRecurringPayables: vi.fn().mockResolvedValue({ items: [], hasMore: false }) })),
}));

import { createFinanceReadModel } from './finance';
import type { Database } from '../../database/index';

// Mock db for getFinanceContracts
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

describe('createFinanceReadModel getFinanceContracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { items, hasMore } shape with items array — not a raw array', async () => {
    mockFinance.listActiveInternalAgentContracts.mockResolvedValue({
      items: [
        { contractId: 'c1', agentId: 'a1', agentName: 'Alice', weeklyValueUsd: 100, autoRenew: false },
      ],
    });
    const db = makeMockDb();
    const store = createFinanceReadModel({ db });
    const result = await store.getFinanceContracts();

    // Shape must match FinanceContractsResponse from admin UI
    expect(result).toHaveProperty('items');
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toHaveProperty('contractId');
    expect(result.items[0]).toHaveProperty('agentName');
  });

  it('returns hasMore: false by default (no pagination)', async () => {
    mockFinance.listActiveInternalAgentContracts.mockResolvedValue({ items: [] });
    const db = makeMockDb();
    const store = createFinanceReadModel({ db });
    const result = await store.getFinanceContracts();

    expect(result).toHaveProperty('hasMore');
    expect(result.hasMore).toBe(false);
  });

  it('adds spentUsd and spentPercent to each contract', async () => {
    mockFinance.listActiveInternalAgentContracts.mockResolvedValue({
      items: [{ contractId: 'c1', agentId: 'a1', agentName: 'Bob', weeklyValueUsd: 200, autoRenew: true }],
    });
    const db = makeMockDb();
    const mockAll = vi.fn().mockResolvedValue([{ contractId: 'c1', total: 50 }]);
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

  it('returns empty items array when no contracts exist', async () => {
    mockFinance.listActiveInternalAgentContracts.mockResolvedValue({ items: [] });
    const db = makeMockDb();
    const store = createFinanceReadModel({ db });
    const result = await store.getFinanceContracts();

    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });

  it('adds spentPercent=0 when weeklyValueUsd is 0 to avoid division by zero', async () => {
    mockFinance.listActiveInternalAgentContracts.mockResolvedValue({
      items: [{ contractId: 'c2', agentId: 'a2', agentName: 'Carol', weeklyValueUsd: 0, autoRenew: false }],
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
});
