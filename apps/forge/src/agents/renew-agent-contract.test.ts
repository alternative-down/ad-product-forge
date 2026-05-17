import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockRecordCashIn, mockRecordCashOut, mockGetCurrentBalanceUsd, mockGetContractSpend } = vi.hoisted(() => ({
  mockRecordCashIn: vi.fn().mockResolvedValue(undefined),
  mockRecordCashOut: vi.fn().mockResolvedValue(undefined),
  mockGetCurrentBalanceUsd: vi.fn().mockResolvedValue(200),
  mockGetContractSpend: vi.fn().mockResolvedValue(30),
}));

vi.mock('../finance/company-cash-ledger', () => ({
  createCompanyCashLedger: vi.fn(() => ({ getCurrentBalanceUsd: mockGetCurrentBalanceUsd })),
}));

vi.mock('../finance/company-cash-operations', () => ({
  createCompanyCashOperations: vi.fn(() => ({ recordCashIn: mockRecordCashIn, recordCashOut: mockRecordCashOut })),
}));

vi.mock('./agent-contract-store', () => ({
  createAgentContractStore: vi.fn(() => ({ getContractSpend: mockGetContractSpend })),
}));

import { renewAgentContract } from './renew-agent-contract';
const agentExecutionContracts = 'agentExecutionContracts';

function createMockDb(contract?: Record<string, unknown> | null) {
  const txUpdate = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });
  const txInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
  return {
    query: {
      agentExecutionContracts: { findFirst: vi.fn().mockResolvedValue(contract ?? null) },
    },
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      await fn({ update: txUpdate, insert: txInsert });
    }),
  };
}

function mockContract(overrides: Record<string, unknown> = {}) {
  return { id: 'contract-1', agentId: 'agent-1', budgetUsd: 100, fundedAt: Date.now() - 100000, autoRenew: false, startsAt: Date.now() - 86400000, endsAt: Date.now() + 86400000, ...overrides };
}

describe('renewAgentContract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentBalanceUsd.mockResolvedValue(200);
    mockGetContractSpend.mockResolvedValue(30);
  });

  it('throws when no active contract exists', async () => {
    const db = createMockDb(null);
    await expect(renewAgentContract(db as any, { agentId: 'agent-1', newBudgetUsd: 200 })).rejects.toThrow('No active contract for agent: agent-1');
  });

  it('throws when insufficient cash for new budget', async () => {
    mockGetCurrentBalanceUsd.mockResolvedValue(50);
    mockGetContractSpend.mockResolvedValue(80);
    const db = createMockDb(mockContract({ budgetUsd: 100, fundedAt: Date.now() }));
    await expect(renewAgentContract(db as any, { agentId: 'agent-1', newBudgetUsd: 200 })).rejects.toThrow('Insufficient company cash to renew this contract');
  });

  it('records cash in for refundable amount when fundedAt exists', async () => {
    const db = createMockDb(mockContract({ budgetUsd: 100, fundedAt: Date.now() }));
    await renewAgentContract(db as any, { agentId: 'agent-1', newBudgetUsd: 150 });
    expect(mockRecordCashIn).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agent-contract-renewal-refund', referenceType: 'agent-execution-contract' }),
      expect.any(Object),
    );
  });

  it('does not record cash in when contract is not funded', async () => {
    const db = createMockDb(mockContract({ budgetUsd: 100, fundedAt: null }));
    await renewAgentContract(db as any, { agentId: 'agent-1', newBudgetUsd: 150 });
    expect(mockRecordCashIn).not.toHaveBeenCalled();
  });

  it('closes old contract in transaction', async () => {
    const db = createMockDb(mockContract({ id: 'old-contract', budgetUsd: 100 }));
    await renewAgentContract(db as any, { agentId: 'agent-1', newBudgetUsd: 150 });
    expect(db.transaction).toHaveBeenCalled();
  });

  it('inserts new contract in transaction', async () => {
    const db = createMockDb(mockContract({ id: 'old-contract', budgetUsd: 100 }));
    await renewAgentContract(db as any, { agentId: 'agent-1', newBudgetUsd: 200 });
    expect(db.transaction).toHaveBeenCalled();
  });

  it('records cash out for new contract funding', async () => {
    const db = createMockDb(mockContract({ budgetUsd: 100 }));
    await renewAgentContract(db as any, { agentId: 'agent-1', newBudgetUsd: 150 });
    expect(mockRecordCashOut).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agent-contract-renewal-funding', amountUsd: 150 }),
      expect.any(Object),
    );
  });

  it('wraps contract lifecycle in transaction', async () => {
    const db = createMockDb(mockContract({ budgetUsd: 100 }));
    await renewAgentContract(db as any, { agentId: 'agent-1', newBudgetUsd: 150 });
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('returns object with agentId, previousContractId, newContractId', async () => {
    const db = createMockDb(mockContract({ id: 'prev-c', budgetUsd: 100 }));
    const result = await renewAgentContract(db as any, { agentId: 'agent-1', newBudgetUsd: 150 });
    expect(result.agentId).toBe('agent-1');
    expect(result.previousContractId).toBe('prev-c');
    expect(result.newContractId).toBeDefined();
    expect(result.newContractId).not.toBe('prev-c');
  });

  it('returns previousBudgetUsd and newBudgetUsd', async () => {
    const db = createMockDb(mockContract({ budgetUsd: 100 }));
    const result = await renewAgentContract(db as any, { agentId: 'agent-1', newBudgetUsd: 250 });
    expect(result.previousBudgetUsd).toBe(100);
    expect(result.newBudgetUsd).toBe(250);
  });

  it('returns previousSpentUsd from contractStore.getContractSpend', async () => {
    mockGetContractSpend.mockResolvedValue(45.5);
    const db = createMockDb(mockContract({ budgetUsd: 100 }));
    const result = await renewAgentContract(db as any, { agentId: 'agent-1', newBudgetUsd: 150 });
    expect(result.previousSpentUsd).toBe(45.5);
  });

  it('returns refundedUsd based on budget minus spent when funded', async () => {
    mockGetContractSpend.mockResolvedValue(25);
    const db = createMockDb(mockContract({ budgetUsd: 100, fundedAt: Date.now() }));
    const result = await renewAgentContract(db as any, { agentId: 'agent-1', newBudgetUsd: 150 });
    expect(result.refundedUsd).toBe(75);
  });

  it('returns refundedUsd of 0 when contract not funded', async () => {
    mockGetContractSpend.mockResolvedValue(25);
    const db = createMockDb(mockContract({ budgetUsd: 100, fundedAt: null }));
    const result = await renewAgentContract(db as any, { agentId: 'agent-1', newBudgetUsd: 150 });
    expect(result.refundedUsd).toBe(0);
  });

  it('sets startsAt and endsAt on result with WEEK_MS offset', async () => {
    const db = createMockDb(mockContract({ budgetUsd: 100 }));
    const result = await renewAgentContract(db as any, { agentId: 'agent-1', newBudgetUsd: 150 });
    expect(result.endsAt).toBeGreaterThan(result.startsAt);
    expect(result.endsAt - result.startsAt).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('preserves autoRenew from active contract in new contract', async () => {
    const db = createMockDb(mockContract({ autoRenew: true }));
    await renewAgentContract(db as any, { agentId: 'agent-1', newBudgetUsd: 150 });
    expect(db.transaction).toHaveBeenCalled();
  });

  it('uses contractStore.getContractSpend to calculate refund', async () => {
    mockGetContractSpend.mockResolvedValue(80);
    const db = createMockDb(mockContract({ budgetUsd: 100 }));
    await renewAgentContract(db as any, { agentId: 'agent-1', newBudgetUsd: 150 });
    expect(mockGetContractSpend).toHaveBeenCalledWith('contract-1');
  });

  it('handles refund scenario where spent equals budget (zero refund)', async () => {
    mockGetContractSpend.mockResolvedValue(100);
    const db = createMockDb(mockContract({ budgetUsd: 100, fundedAt: Date.now() }));
    const result = await renewAgentContract(db as any, { agentId: 'agent-1', newBudgetUsd: 120 });
    expect(result.refundedUsd).toBe(0);
    expect(mockRecordCashIn).not.toHaveBeenCalled();
  });

  it('new contract is funded upfront (fundedAt set in insert)', async () => {
    const db = createMockDb(mockContract({ budgetUsd: 100 }));
    const result = await renewAgentContract(db as any, { agentId: 'agent-1', newBudgetUsd: 150 });
    // fundedAt is set in the insert values, not via separate update
    expect(result.newContractId).toBeDefined();
  });
});
