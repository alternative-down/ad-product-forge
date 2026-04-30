import { describe, expect, it, vi, beforeEach } from 'vitest';
import { adjustAgentContractBudget } from './adjust-agent-contract-budget';

const mocks = vi.hoisted(() => ({
  createIdMock: vi.fn(() => 'generated-id'),
  getCurrentBalanceUsdMock: vi.fn(),
  recordCashOutMock: vi.fn(() => Promise.resolve()),
  recordCashInMock: vi.fn(() => Promise.resolve()),
  updateMock: vi.fn(() => Promise.resolve()),
  getContractSpendMock: vi.fn(),
}));

vi.mock('../utils/id', () => ({ createId: mocks.createIdMock }));

function createMockDb(withContract = true) {
  const contract = withContract ? {
    id: 'contract-1',
    agentId: 'agent-1',
    budgetUsd: 100,
    startsAt: Date.now() - 86400000,
    endsAt: Date.now() + 86400000,
  } : null;
  
  return {
    query: {
      agentExecutionContracts: {
        findFirst: vi.fn(() => Promise.resolve(contract)),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: mocks.updateMock,
      })),
    })),
  };
}

function createMockLedger() {
  return {
    getCurrentBalanceUsd: mocks.getCurrentBalanceUsdMock,
  };
}

function createMockOperations() {
  return {
    recordCashOut: mocks.recordCashOutMock,
    recordCashIn: mocks.recordCashInMock,
  };
}

function createMockContractStore() {
  return {
    getContractSpend: mocks.getContractSpendMock,
  };
}

vi.mock('../finance/company-cash-ledger', () => ({
  createCompanyCashLedger: vi.fn(() => createMockLedger()),
}));

vi.mock('../finance/company-cash-operations', () => ({
  createCompanyCashOperations: vi.fn(() => createMockOperations()),
}));

vi.mock('./agent-contract-store', () => ({
  createAgentContractStore: vi.fn(() => createMockContractStore()),
}));

describe('adjustAgentContractBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentBalanceUsdMock.mockResolvedValue(1000);
    mocks.recordCashOutMock.mockResolvedValue(undefined);
    mocks.recordCashInMock.mockResolvedValue(undefined);
    mocks.updateMock.mockResolvedValue(undefined);
    mocks.getContractSpendMock.mockResolvedValue(0);
  });

  it('returns no-change when new budget equals current budget', async () => {
    const result = await adjustAgentContractBudget(createMockDb() as any, {
      agentId: 'agent-1',
      newBudgetUsd: 100,
    });

    expect(result.changeType).toBe('none');
    expect(result.changeAmountUsd).toBe(0);
  });

  it('throws when no active contract exists', async () => {
    const db = createMockDb(false); // No contract

    await expect(adjustAgentContractBudget(db as any, {
      agentId: 'agent-1',
      newBudgetUsd: 200,
    })).rejects.toThrow('No active contract');
  });

  it('increases budget and deducts company cash', async () => {
    const result = await adjustAgentContractBudget(createMockDb() as any, {
      agentId: 'agent-1',
      newBudgetUsd: 200,
    });

    expect(result.changeType).toBe('increase');
    expect(result.changeAmountUsd).toBe(100);
    expect(result.previousBudgetUsd).toBe(100);
    expect(result.newBudgetUsd).toBe(200);
    expect(mocks.recordCashOutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent-contract-budget-increase',
        amountUsd: 100,
        referenceType: 'agent-execution-contract',
      })
    );
    expect(mocks.updateMock).toHaveBeenCalled();
  });

  it('throws when increasing budget without sufficient cash', async () => {
    mocks.getCurrentBalanceUsdMock.mockResolvedValue(50);

    await expect(adjustAgentContractBudget(createMockDb() as any, {
      agentId: 'agent-1',
      newBudgetUsd: 200,
    })).rejects.toThrow('Insufficient company cash');
  });

  it('decreases budget and refunds to company cash', async () => {
    mocks.getContractSpendMock.mockResolvedValue(10);

    const result = await adjustAgentContractBudget(createMockDb() as any, {
      agentId: 'agent-1',
      newBudgetUsd: 50,
    });

    expect(result.changeType).toBe('decrease');
    expect(result.changeAmountUsd).toBe(-50);
    expect(mocks.recordCashInMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent-contract-budget-decrease',
        amountUsd: 50,
      })
    );
  });

  it('throws when decreasing budget below spent amount', async () => {
    mocks.getContractSpendMock.mockResolvedValue(60);

    await expect(adjustAgentContractBudget(createMockDb() as any, {
      agentId: 'agent-1',
      newBudgetUsd: 50,
    })).rejects.toThrow(/Cannot reduce budget below spent amount/);
  });
});
