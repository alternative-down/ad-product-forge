import { describe, expect, test, vi } from 'vitest';
import { createMicroErpReadModel } from './read-model';

// ─── Row factories ────────────────────────────────────────────────────────────
//
// DB column names match what read-model.ts queries return.
// `contractId` = alias for agentExecutionContracts.id (see the select statement).
// `id` is kept for the agent-execution-steps table rows.
//

function makeCashRow(overrides = {}): {
  id: string; type: string; direction: string;
  amountUsd: number; status: string;
  dueAt?: number | null; effectiveAt?: number | null; createdAt: number;
} {
  const now = Date.now();
  return {
    id: 'r1', type: 'test', direction: 'in', amountUsd: 100,
    status: 'posted', effectiveAt: now, createdAt: now,
    ...overrides,
  };
}

function makeContractRow(overrides: Partial<{
  contractId: string; agentId: string; agentName: string;
  budgetUsd: number; weeklyValueUsd: number; autoRenew: number;
  startsAt: number; endsAt: number;
}> = {}): {
  contractId: string; agentId: string; agentName: string;
  budgetUsd: number; weeklyValueUsd: number; autoRenew: number;
  startsAt: number; endsAt: number;
} {
  const now = Date.now();
  return {
    contractId: 'c1', agentId: 'a1', agentName: 'Test Agent',
    budgetUsd: 500, weeklyValueUsd: overrides.budgetUsd ?? 500, autoRenew: 1,
    startsAt: now - 86_400_000, endsAt: now + 86_400_000 * 30,
    ...overrides,
  };
}

function makeStepRow(overrides: Partial<{
  id: string; contractId: string; agentId: string;
  llmProfileId: string; modelKey: string; kind: string;
  inputTokens: number; cachedInputTokens: number; outputTokens: number;
  inputPerMillionUsd: number; inputCachePerMillionUsd: number;
  outputPerMillionUsd: number; contractCostMultiplier: number;
  costUsd: number; createdAt: number;
}> = {}): {
  id: string; contractId: string; agentId: string;
  llmProfileId: string; modelKey: string; kind: string;
  inputTokens: number; cachedInputTokens: number; outputTokens: number;
  inputPerMillionUsd: number; inputCachePerMillionUsd: number;
  outputPerMillionUsd: number; contractCostMultiplier: number;
  costUsd: number; createdAt: number;
} {
  const now = Date.now();
  return {
    id: 's1', contractId: 'c1', agentId: 'a1',
    llmProfileId: 'p1', modelKey: 'gpt-4o', kind: 'chat',
    inputTokens: 1000, cachedInputTokens: 0, outputTokens: 500,
    inputPerMillionUsd: 2.5, inputCachePerMillionUsd: 0.5,
    outputPerMillionUsd: 10, contractCostMultiplier: 1,
    costUsd: 0.0075, createdAt: now,
    ...overrides,
  };
}

// ─── Drizzle-compatible thenable chain mock ──────────────────────────────────
function makeSelectChain(rows: unknown[] = []) {
  const chain: Record<string, (...args: unknown[]) => unknown> = {
    from: vi.fn().mockImplementation(() => chain),
    innerJoin: vi.fn().mockImplementation(() => chain),
    where: vi.fn().mockImplementation(() => chain),
    orderBy: vi.fn().mockImplementation(() => chain),
    limit: vi.fn().mockImplementation(() => chain),
    offset: vi.fn().mockImplementation(() => chain),
    groupBy: vi.fn().mockImplementation(() => chain),
    all: vi.fn().mockImplementation(() => rows),
  };
  const promise = Promise.resolve(rows);
  return Object.assign(chain, { then: promise.then.bind(promise) });
}

// ─── Mock DB factory ─────────────────────────────────────────────────────────
function createMockDb(opts: {
  cashRows?: ReturnType<typeof makeCashRow>[];
  contracts?: ReturnType<typeof makeContractRow>[];
  steps?: ReturnType<typeof makeStepRow>[];
  aggregateInOut?: { totalInUsd: number; totalOutUsd: number };
  scheduledTotals?: { scheduledInUsd: number; scheduledOutUsd: number };
  balanceUsd?: number;
} = {}) {
  const {
    cashRows = [],
    contracts = [],
    steps = [],
    aggregateInOut = { totalInUsd: 0, totalOutUsd: 0 },
    scheduledTotals = { scheduledInUsd: 0, scheduledOutUsd: 0 },
    balanceUsd = 0,
  } = opts;

  // Build named chains keyed to each unique query pattern.
  const postedChain      = makeSelectChain([aggregateInOut]);
  const scheduledChain   = makeSelectChain([scheduledTotals]);
  const balanceChain     = makeSelectChain([{ total: balanceUsd }]);
  const contractsChain    = makeSelectChain([...contracts]);
    // Recursively extract all non-operator string values from a Drizzle expression.
  function extractVals(expr: any) {
    const vals: any[] = [];
    function go(o: any) {
      if (typeof o === 'string') { vals.push(o); return; }
      if (Array.isArray(o)) { o.forEach(go); return; }
      if (o && typeof o === 'object') {
        if (o.value) go(o.value);
        if (o.queryChunks) go(o.queryChunks);
      }
    }
    go(expr);
    return vals.filter(v => v.trim().length > 0 && !v.match(/^[\s=<>+\-*()]+$/) && !/^\d+$/.test(v));
  }
  contractsChain.where = vi.fn().mockImplementation((arg) => {
    // Extract string values from Drizzle expression queryChunks.
    const vals = extractVals(arg);
    if (vals.length > 0) {
      // Use the first string value as agentId filter.
      const agentId = vals.find(v => v.startsWith('a') || v.startsWith('c'));
      if (agentId) {
        const filtered = contracts.filter(c => c.agentId === agentId);
        return makeSelectChain(filtered);
      }
    }
    return makeSelectChain(contracts);
  });

  // Spend query: rows with { contractId, total: sum of costUsd per contract }
  const spendRows = contracts.map(c => ({
    contractId: c.contractId,
    total: steps
      .filter(s => s.contractId === c.contractId)
      .reduce((sum, s) => sum + s.costUsd, 0),
  }));
  const spendChain = makeSelectChain(spendRows);

  const db: Record<string, unknown> = {
    select: vi.fn().mockImplementation((cols: Record<string, unknown>) => {
      const keys = Object.keys(cols);
      if (keys.includes('totalInUsd') && keys.includes('totalOutUsd')) return postedChain;
      if (keys.includes('scheduledInUsd')) return scheduledChain;
      if (keys.includes('total') && !keys.includes('contractId')) return balanceChain;
      if (keys.includes('contractId') && keys.includes('total')) return spendChain;
      return contractsChain;
    }),
    query: {
      companyCashLedger: {
        findMany: vi.fn().mockResolvedValue(cashRows),
      },
      agentExecutionSteps: {
        findMany: vi.fn().mockResolvedValue(steps),
      },
    },
  };

  const model = createMicroErpReadModel(db as never);
  return { model, db };
}

// ─── getCompanyCashBalance ───────────────────────────────────────────────────

describe('getCompanyCashBalance', () => {
  test('returns balance from companyCash ledger', async () => {
    const { model } = createMockDb({ balanceUsd: 1234.56 });
    const result = await model.getCompanyCashBalance();
    expect(result.balanceUsd).toBe(1234.56);
  });

  test('returns 0 when no entries', async () => {
    const { model } = createMockDb({ balanceUsd: 0 });
    const result = await model.getCompanyCashBalance();
    expect(result.balanceUsd).toBe(0);
  });
});

// ─── listCompanyCashMovements ────────────────────────────────────────────────

describe('listCompanyCashMovements', () => {
  test('returns empty items and total 0 for no rows', async () => {
    const { model } = createMockDb({ cashRows: [] });
    const result = await model.listCompanyCashMovements();
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  test('returns cash movement rows', async () => {
    const rows = [
      makeCashRow({ id: 'e1', direction: 'in', amountUsd: 100 }),
      makeCashRow({ id: 'e2', direction: 'out', amountUsd: 30 }),
    ];
    const { model } = createMockDb({ cashRows: rows });
    const result = await model.listCompanyCashMovements();
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.direction).toBe('in');
    expect(result.items[1]!.direction).toBe('out');
  });

  test('returns summary alongside items', async () => {
    const { model } = createMockDb({ cashRows: [], balanceUsd: 0 });
    const result = await model.listCompanyCashMovements();
    expect(result.summary).toBeDefined();
    expect(typeof (result.summary as any).balanceUsd).toBe('number');
    expect(typeof (result.summary as any).netUsd).toBe('number');
  });

  test('uses findMany for rows', async () => {
    const rows = [makeCashRow({ id: 'e1' })];
    const { model, db } = createMockDb({ cashRows: rows });
    await model.listCompanyCashMovements();
    expect((db.query as any).companyCashLedger.findMany).toHaveBeenCalled();
  });

  test('filters by direction when provided', async () => {
    const rows = [makeCashRow({ direction: 'out' })];
    const { model } = createMockDb({ cashRows: rows });
    const result = await model.listCompanyCashMovements({ direction: 'out' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.direction).toBe('out');
  });
});

// ─── getCompanyCashSummary ────────────────────────────────────────────────────

describe('getCompanyCashSummary', () => {
  test('returns summary with period boundaries', async () => {
    const now = Date.now();
    const { model } = createMockDb({ aggregateInOut: { totalInUsd: 500, totalOutUsd: 100 } });
    const result = await model.getCompanyCashSummary({ periodStart: now - 86_400_000, periodEnd: now });
    expect(result.periodStart).toBeDefined();
    expect(result.periodEnd).toBeDefined();
  });

  test('netUsd equals totalIn minus totalOut', async () => {
    const { model } = createMockDb({ aggregateInOut: { totalInUsd: 1000, totalOutUsd: 300 } });
    const result = await model.getCompanyCashSummary();
    expect(result.netUsd).toBe(700);
    expect(result.totalInUsd).toBe(1000);
    expect(result.totalOutUsd).toBe(300);
  });

  test('includes posted and scheduled amounts', async () => {
    const { model } = createMockDb({
      aggregateInOut: { totalInUsd: 500, totalOutUsd: 200 },
      scheduledTotals: { scheduledInUsd: 100, scheduledOutUsd: 50 },
    });
    const result = await model.getCompanyCashSummary();
    expect(result.totalInUsd).toBe(500);
    expect(result.totalOutUsd).toBe(200);
    expect(result.scheduledInUsd).toBe(100);
    expect(result.scheduledOutUsd).toBe(50);
  });
});

// ─── listActiveInternalAgentContracts ────────────────────────────────────────

describe('listActiveInternalAgentContracts', () => {
  test('returns empty items for no contracts', async () => {
    const { model } = createMockDb({ contracts: [], steps: [] });
    const result = await model.listActiveInternalAgentContracts();
    expect(result.items).toHaveLength(0);
  });

  test('returns contracts with autoRenew as boolean', async () => {
    const contracts = [
      makeContractRow({ contractId: 'c1', autoRenew: 1 }),
      makeContractRow({ contractId: 'c2', autoRenew: 0 }),
    ];
    const { model } = createMockDb({ contracts, steps: [] });
    const result = await model.listActiveInternalAgentContracts();
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.autoRenew).toBe(true);
    expect(result.items[1]!.autoRenew).toBe(false);
  });

  test('includes agentName from join', async () => {
    const contracts = [makeContractRow({ contractId: 'c1', agentName: 'Alice' })];
    const { model } = createMockDb({ contracts, steps: [] });
    const result = await model.listActiveInternalAgentContracts();
    expect(result.items[0]!.agentName).toBe('Alice');
  });

  test('includes budget metrics from getActiveContractMetrics', async () => {
    const contracts = [makeContractRow({ contractId: 'c1', budgetUsd: 500 })];
    const steps = [makeStepRow({ contractId: 'c1', costUsd: 50 })];
    const { model } = createMockDb({ contracts, steps });
    const result = await model.listActiveInternalAgentContracts();
    // getActiveContractMetrics returns: spentUsd, budgetRemainingUsd, budgetUsedPct,
    // recentSteps (up to 10, ordered by createdAt desc), daysUntilEnd
    expect(result.items[0]!.spentUsd).toBe(50);
    expect(result.items[0]!.budgetRemainingUsd).toBe(450);
    expect(result.items[0]!.budgetUsedPct).toBe(10);
    expect(result.items[0]!.daysUntilEnd).toBeGreaterThan(0);
    expect(result.items[0]!.recentSteps).toHaveLength(1);
  });


  test('budgetUsedPct = (spentUsd / budgetUsd) * 100', async () => {
    const contracts = [makeContractRow({ contractId: 'c1', budgetUsd: 200 })];
    const steps = [
      makeStepRow({ contractId: 'c1', costUsd: 50 }),
      makeStepRow({ contractId: 'c1', costUsd: 50 }),
    ];
    const { model } = createMockDb({ contracts, steps });
    const result = await model.listActiveInternalAgentContracts();
    expect(result.items[0]!.spentUsd).toBe(100);
    expect(result.items[0]!.budgetUsedPct).toBe(50);
  });

  test('daysUntilEnd is positive for future endAt', async () => {
    const now = Date.now();
    const sevenDays = 86_400_000 * 7;
    const contracts = [makeContractRow({ contractId: 'c1', endsAt: now + sevenDays })];
    const { model } = createMockDb({ contracts, steps: [] });
    const result = await model.listActiveInternalAgentContracts();
    expect(result.items[0]!.daysUntilEnd).toBeGreaterThanOrEqual(6);
    expect(result.items[0]!.daysUntilEnd).toBeLessThanOrEqual(8);
  });

  test('recentSteps is capped at 10', async () => {
    const now = Date.now();
    const contracts = [makeContractRow({ contractId: 'c1', budgetUsd: 500 })];
    const steps = Array.from({ length: 15 }, (_, i) =>
      makeStepRow({ contractId: 'c1', costUsd: 1, createdAt: now + i * 1000 })
    );
    const { model } = createMockDb({ contracts, steps });
    const result = await model.listActiveInternalAgentContracts();
    expect(result.items[0]!.recentSteps).toHaveLength(10);
  });
});

// ─── getActiveInternalAgentContract ─────────────────────────────────────────

describe('getActiveInternalAgentContract', () => {
  test('returns null when no matching contract', async () => {
    const { model } = createMockDb({ contracts: [], steps: [] });
    const result = await model.getActiveInternalAgentContract('unknown-agent');
    expect(result).toBeNull();
  });

  test('returns contract for matching agent', async () => {
    const contracts = [makeContractRow({ contractId: 'c1', agentId: 'a1', budgetUsd: 500 })];
    const steps = [makeStepRow({ contractId: 'c1', costUsd: 25 })];
    const { model } = createMockDb({ contracts, steps });
    const result = await model.getActiveInternalAgentContract('a1');
    expect(result).not.toBeNull();
    expect(result!.agentId).toBe('a1');
    expect(result!.spentUsd).toBe(25);
  });

  test('returns null for agent with no active contract', async () => {
    const contracts = [makeContractRow({ contractId: 'c1', agentId: 'other' })];
    const { model } = createMockDb({ contracts, steps: [] });
    const result = await model.getActiveInternalAgentContract('a1');
    expect(result).toBeNull();
  });

  test('autoRenew is boolean on result', async () => {
    const contracts = [makeContractRow({ contractId: 'c1', agentId: 'a1', autoRenew: 1 })];
    const { model } = createMockDb({ contracts, steps: [] });
    const result = await model.getActiveInternalAgentContract('a1');
    expect(typeof result!.autoRenew).toBe('boolean');
  });
});

// ─── getActiveContractMetrics — averageStepIntervalLabel ─────────────────────

describe('getActiveContractMetrics — budget fields', () => {
  test('budgetRemainingUsd = budgetUsd - spentUsd (capped at 0)', async () => {
    const contracts = [makeContractRow({ contractId: 'c1', budgetUsd: 1000 })];
    const steps = [makeStepRow({ contractId: 'c1', costUsd: 300 })];
    const { model } = createMockDb({ contracts, steps });
    const result = await model.listActiveInternalAgentContracts();
    expect(result.items[0]!.budgetRemainingUsd).toBe(700);
    expect(result.items[0]!.spentUsd).toBe(300);
  });

  test('budgetRemainingUsd is 0 when overspent', async () => {
    const contracts = [makeContractRow({ contractId: 'c1', budgetUsd: 50 })];
    const steps = [makeStepRow({ contractId: 'c1', costUsd: 100 })];
    const { model } = createMockDb({ contracts, steps });
    const result = await model.listActiveInternalAgentContracts();
    expect(result.items[0]!.budgetRemainingUsd).toBe(0);
    expect(result.items[0]!.budgetUsedPct).toBe(200);
  });

  test('recentSteps contains steps for the contract', async () => {
    const now = Date.now();
    const contracts = [makeContractRow({ contractId: 'c1' })];
    const steps = [
      makeStepRow({ id: 's1', contractId: 'c1', costUsd: 1, createdAt: now }),
      makeStepRow({ id: 's2', contractId: 'c1', costUsd: 1, createdAt: now + 1000 }),
    ];
    const { model } = createMockDb({ contracts, steps });
    const result = await model.listActiveInternalAgentContracts();
    // recentSteps is an array of step objects, capped at 10
    expect(result.items[0]!.recentSteps).toHaveLength(2);
    expect(result.items[0]!.recentSteps.map((s: any) => s.id)).toContain('s1');
    expect(result.items[0]!.recentSteps.map((s: any) => s.id)).toContain('s2');
  });
});


// ─── Error handling ───────────────────────────────────────────────────────────

describe('listCompanyCashMovements — error handling', () => {
  test('throws when findMany fails', async () => {
    const db = {
      query: { companyCashLedger: { findMany: vi.fn().mockRejectedValue(new Error('db unavailable')) } },
    } as never;
    const model = createMicroErpReadModel(db as never);

    await expect(model.listCompanyCashMovements()).rejects.toThrow('db unavailable');
  });
});

describe('listActiveInternalAgentContracts — error handling', () => {
  test('throws when contracts query fails', async () => {
    const db = {
      query: {
        companyCashLedger: { findMany: vi.fn() },
        agentExecutionSteps: { findMany: vi.fn() },
      },
      select: vi.fn().mockImplementation(() => {
        const chain = {
          from: vi.fn().mockReturnThis(),
          innerJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          all: vi.fn().mockRejectedValue(new Error('contracts query failed')),
        };
        const p = Promise.resolve([]);
        return Object.assign(chain, { then: p.then.bind(p) });
      }),
    } as never;
    const model = createMicroErpReadModel(db as never);

    await expect(model.listActiveInternalAgentContracts()).rejects.toThrow('contracts query failed');
  });
});
