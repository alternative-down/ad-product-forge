import { describe, expect, it, vi, beforeEach } from 'vitest';
import { topUpActiveAgentContract } from './top-up-agent-contract';

const mocks = vi.hoisted(() => ({
  getCurrentBalanceUsdMock: vi.fn(),
  recordCashOutMock: vi.fn(() => Promise.resolve()),
  updateMock: vi.fn(() => Promise.resolve()),
}));

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
    recordCashIn: vi.fn(),
  };
}

vi.mock('../finance/company-cash-ledger', () => ({
  createCompanyCashLedger: vi.fn(() => createMockLedger()),
}));

vi.mock('../finance/company-cash-operations', () => ({
  createCompanyCashOperations: vi.fn(() => createMockOperations()),
}));

describe('topUpActiveAgentContract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentBalanceUsdMock.mockResolvedValue(1000);
    mocks.recordCashOutMock.mockResolvedValue(undefined);
    mocks.updateMock.mockResolvedValue(undefined);
  });

  it('throws when no active contract exists', async () => {
    const db = createMockDb(false);

    await expect(topUpActiveAgentContract(db as any, {
      agentId: 'agent-1',
      amountUsd: 50,
    })).rejects.toThrow('No active contract');
  });

  it('throws when insufficient company cash', async () => {
    mocks.getCurrentBalanceUsdMock.mockResolvedValue(20);

    await expect(topUpActiveAgentContract(createMockDb() as any, {
      agentId: 'agent-1',
      amountUsd: 50,
    })).rejects.toThrow('Insufficient company cash');
  });

  it('deducts company cash and updates contract budget', async () => {
    const result = await topUpActiveAgentContract(createMockDb() as any, {
      agentId: 'agent-1',
      amountUsd: 50,
    });

    expect(result.agentId).toBe('agent-1');
    expect(result.contractId).toBe('contract-1');
    expect(result.budgetUsd).toBe(150); // 100 + 50

    expect(mocks.recordCashOutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent-contract-topup',
        amountUsd: 50,
        referenceType: 'agent-execution-contract',
      })
    );

    expect(mocks.updateMock).toHaveBeenCalled();
  });

  it('returns updated budget in result', async () => {
    const result = await topUpActiveAgentContract(createMockDb() as any, {
      agentId: 'agent-1',
      amountUsd: 100,
    });

    expect(result.budgetUsd).toBe(200);
  });
});
