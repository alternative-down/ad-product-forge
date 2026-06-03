import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockRecordCashOut, mockGetCurrentBalanceUsd } = vi.hoisted(() => ({
  mockRecordCashOut: vi.fn().mockResolvedValue(undefined),
  mockGetCurrentBalanceUsd: vi.fn().mockResolvedValue(1000),
}));

vi.mock('../finance/company-cash-ledger', () => ({
  createCompanyCashLedger: vi.fn(() => ({ getCurrentBalanceUsd: mockGetCurrentBalanceUsd })),
}));

vi.mock('../finance/company-cash-operations', () => ({
  createCompanyCashOperations: vi.fn(() => ({ recordCashOut: mockRecordCashOut })),
}));

import { topUpActiveAgentContract } from './top-up-agent-contract';
import { agentExecutionContracts } from '../database/schema-agents';

function createMockDb(contract?: Record<string, unknown> | null) {
  const tx = {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
  };
  return {
    query: { agentExecutionContracts: { findFirst: vi.fn().mockResolvedValue(contract ?? null) } },
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
    _tx: tx,
  };
}

function mockContract(overrides: Record<string, unknown> = {}) {
  return {
    id: 'contract-1',
    agentId: 'agent-1',
    budgetUsd: 100,
    startsAt: Date.now() - 86400000,
    endsAt: Date.now() + 86400000,
    ...overrides,
  };
}

describe('topUpActiveAgentContract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentBalanceUsd.mockResolvedValue(1000);
  });

  it('throws when no active contract exists', async () => {
    const db = createMockDb(null);
    await expect(
      topUpActiveAgentContract(db as any, { agentId: 'agent-1', amountUsd: 50 }),
    ).rejects.toThrow('No active contract for agent: agent-1');
  });

  it('throws when insufficient company cash', async () => {
    mockGetCurrentBalanceUsd.mockResolvedValue(20);
    const db = createMockDb(mockContract({ budgetUsd: 100 }));
    await expect(
      topUpActiveAgentContract(db as any, { agentId: 'agent-1', amountUsd: 50 }),
    ).rejects.toThrow('Insufficient company cash for contract top-up');
  });

  it('records cash out for top-up amount', async () => {
    const db = createMockDb(mockContract({ id: 'c-1', budgetUsd: 100 }));
    await topUpActiveAgentContract(db as any, { agentId: 'agent-1', amountUsd: 50 });
    expect(mockRecordCashOut).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent-contract-topup',
        amountUsd: 50,
        referenceType: 'agent-execution-contract',
        referenceId: 'c-1',
      }),
      expect.any(Object),
    );
  });

  it('updates contract budget by adding amount', async () => {
    const db = createMockDb(mockContract({ id: 'c-1', budgetUsd: 100 }));
    await topUpActiveAgentContract(db as any, { agentId: 'agent-1', amountUsd: 50 });
    expect(db.transaction).toHaveBeenCalled();
    expect((db as any)._tx.update).toHaveBeenCalledWith(agentExecutionContracts);
  });

  it('returns agentId, contractId, and new budgetUsd', async () => {
    const db = createMockDb(mockContract({ id: 'c-1', agentId: 'agent-1', budgetUsd: 100 }));
    const result = await topUpActiveAgentContract(db as any, { agentId: 'agent-1', amountUsd: 50 });
    expect(result.agentId).toBe('agent-1');
    expect(result.contractId).toBe('c-1');
    expect(result.budgetUsd).toBe(150);
  });

  it('calls findFirst to locate active contract', async () => {
    const db = createMockDb(mockContract());
    await topUpActiveAgentContract(db as any, { agentId: 'agent-1', amountUsd: 50 });
    expect(db.query.agentExecutionContracts.findFirst).toHaveBeenCalled();
  });

  it('returns updated budget including top-up amount', async () => {
    const db = createMockDb(mockContract({ budgetUsd: 200 }));
    const result = await topUpActiveAgentContract(db as any, { agentId: 'agent-1', amountUsd: 75 });
    expect(result.budgetUsd).toBe(275);
  });

  it('handles large top-up amount with sufficient cash', async () => {
    mockGetCurrentBalanceUsd.mockResolvedValue(100000);
    const db = createMockDb(mockContract({ budgetUsd: 100 }));
    const result = await topUpActiveAgentContract(db as any, {
      agentId: 'agent-1',
      amountUsd: 50000,
    });
    expect(result.budgetUsd).toBe(50100);
  });

  it('works with tiny top-up amount', async () => {
    const db = createMockDb(mockContract({ budgetUsd: 100 }));
    const result = await topUpActiveAgentContract(db as any, {
      agentId: 'agent-1',
      amountUsd: 0.01,
    });
    expect(result.budgetUsd).toBeCloseTo(100.01);
  });
});
