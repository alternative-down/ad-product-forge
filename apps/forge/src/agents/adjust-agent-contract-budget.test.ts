import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockRecordCashOut, mockRecordCashIn, mockGetCurrentBalanceUsd, mockGetContractSpend } =
  vi.hoisted(() => ({
    mockRecordCashOut: vi.fn().mockResolvedValue(undefined),
    mockRecordCashIn: vi.fn().mockResolvedValue(undefined),
    mockGetCurrentBalanceUsd: vi.fn().mockResolvedValue(1000),
    mockGetContractSpend: vi.fn().mockResolvedValue(50),
  }));

vi.mock('../finance/company-cash-ledger', () => ({
  createCompanyCashLedger: vi.fn(() => ({ getCurrentBalanceUsd: mockGetCurrentBalanceUsd })),
}));

vi.mock('../finance/company-cash-operations', () => ({
  createCompanyCashOperations: vi.fn(() => ({
    recordCashOut: mockRecordCashOut,
    recordCashIn: mockRecordCashIn,
  })),
}));

vi.mock('./agent-contract-store', () => ({
  createAgentContractStore: vi.fn(() => ({ getContractSpend: mockGetContractSpend })),
}));

import { adjustAgentContractBudget } from './adjust-agent-contract-budget';
const agentExecutionContracts = 'agentExecutionContracts';

function createMockDb(contract: Record<string, unknown> | null) {
  const tx = {
    update: vi
      .fn()
      .mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
  };
  return {
    query: { agentExecutionContracts: { findFirst: vi.fn().mockResolvedValue(contract) } },
    update: vi
      .fn()
      .mockReturnValue({
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

describe('adjustAgentContractBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when no active contract exists', async () => {
    const db = createMockDb(null);
    await expect(
      adjustAgentContractBudget(db as any, { agentId: 'agent-1', newBudgetUsd: 200 }),
    ).rejects.toThrow('No active contract for agent: agent-1');
  });

  it('returns changeType none when budget is unchanged', async () => {
    const db = createMockDb(mockContract({ budgetUsd: 100 }));
    const result = await adjustAgentContractBudget(db as any, {
      agentId: 'agent-1',
      newBudgetUsd: 100,
    });
    expect(result.changeType).toBe('none');
    expect(result.changeAmountUsd).toBe(0);
  });

  it('records cash out on budget increase', async () => {
    const db = createMockDb(mockContract({ budgetUsd: 100 }));
    await adjustAgentContractBudget(db as any, { agentId: 'agent-1', newBudgetUsd: 200 });
    expect(mockRecordCashOut).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent-contract-budget-increase',
        amountUsd: 100,
        referenceType: 'agent-execution-contract',
        referenceId: 'contract-1',
      }),
      expect.any(Object),
    );
  });

  it('updates contract in database on budget increase', async () => {
    const db = createMockDb(mockContract({ budgetUsd: 100 }));
    await adjustAgentContractBudget(db as any, { agentId: 'agent-1', newBudgetUsd: 200 });
    expect(db.transaction).toHaveBeenCalled();
    expect((db as any)._tx.update).toHaveBeenCalledWith(agentExecutionContracts);
  });

  it('throws on budget increase when insufficient cash', async () => {
    mockGetCurrentBalanceUsd.mockResolvedValue(50);
    const db = createMockDb(mockContract({ budgetUsd: 100 }));
    await expect(
      adjustAgentContractBudget(db as any, { agentId: 'agent-1', newBudgetUsd: 200 }),
    ).rejects.toThrow('Insufficient company cash for budget increase');
  });

  it('records cash in on budget decrease', async () => {
    const db = createMockDb(mockContract({ budgetUsd: 100 }));
    await adjustAgentContractBudget(db as any, { agentId: 'agent-1', newBudgetUsd: 80 });
    expect(mockRecordCashIn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent-contract-budget-decrease',
        amountUsd: 20,
        referenceType: 'agent-execution-contract',
        referenceId: 'contract-1',
      }),
      expect.any(Object),
    );
  });

  it('throws on budget decrease below spent amount', async () => {
    mockGetContractSpend.mockResolvedValue(60);
    const db = createMockDb(mockContract({ budgetUsd: 100 }));
    await expect(
      adjustAgentContractBudget(db as any, { agentId: 'agent-1', newBudgetUsd: 50 }),
    ).rejects.toThrow(/Cannot reduce budget below spent amount/);
  });

  it('returns changeType increase with positive delta', async () => {
    const db = createMockDb(mockContract({ budgetUsd: 100 }));
    const result = await adjustAgentContractBudget(db as any, {
      agentId: 'agent-1',
      newBudgetUsd: 150,
    });
    expect(result.changeType).toBe('increase');
    expect(result.changeAmountUsd).toBe(50);
    expect(result.newBudgetUsd).toBe(150);
    expect(result.previousBudgetUsd).toBe(100);
  });

  it('returns changeType decrease with negative delta', async () => {
    const db = createMockDb(mockContract({ budgetUsd: 100 }));
    const result = await adjustAgentContractBudget(db as any, {
      agentId: 'agent-1',
      newBudgetUsd: 80,
    });
    expect(result.changeType).toBe('decrease');
    expect(result.changeAmountUsd).toBe(-20);
    expect(result.newBudgetUsd).toBe(80);
    expect(result.previousBudgetUsd).toBe(100);
  });

  it('returns object with agentId and contractId', async () => {
    const db = createMockDb(mockContract({ id: 'contract-xyz', agentId: 'agent-xyz' }));
    const result = await adjustAgentContractBudget(db as any, {
      agentId: 'agent-xyz',
      newBudgetUsd: 120,
    });
    expect(result.agentId).toBe('agent-xyz');
    expect(result.contractId).toBe('contract-xyz');
  });

  it('updates contract with new budget amount on increase', async () => {
    const db = createMockDb(mockContract({ budgetUsd: 50 }));
    await adjustAgentContractBudget(db as any, { agentId: 'agent-1', newBudgetUsd: 75 });
    expect(db.transaction).toHaveBeenCalled();
    expect((db as any)._tx.update).toHaveBeenCalledWith(agentExecutionContracts);
  });

  it('calls findFirst on agentExecutionContracts', async () => {
    mockGetCurrentBalanceUsd.mockResolvedValue(100000);
    const db = createMockDb(mockContract());
    await adjustAgentContractBudget(db as any, { agentId: 'agent-1', newBudgetUsd: 200 });
    expect(db.query.agentExecutionContracts.findFirst).toHaveBeenCalled();
  });

  it('handles large budget increase with sufficient cash', async () => {
    mockGetCurrentBalanceUsd.mockResolvedValue(100000);
    const db = createMockDb(mockContract({ budgetUsd: 100 }));
    const result = await adjustAgentContractBudget(db as any, {
      agentId: 'agent-1',
      newBudgetUsd: 50000,
    });
    expect(result.changeAmountUsd).toBe(49900);
  });

  it('calculates refund amount correctly on decrease', async () => {
    const db = createMockDb(mockContract({ budgetUsd: 100 }));
    await adjustAgentContractBudget(db as any, { agentId: 'agent-1', newBudgetUsd: 60 });
    expect(mockRecordCashIn).toHaveBeenCalledWith(
      expect.objectContaining({ amountUsd: 40 }),
      expect.any(Object),
    );
  });
});
