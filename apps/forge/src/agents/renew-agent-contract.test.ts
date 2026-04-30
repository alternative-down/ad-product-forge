import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renewAgentContract } from './renew-agent-contract';

const mocks = vi.hoisted(() => ({
  createIdMock: vi.fn(() => 'new-contract-id'),
  recordCashInMock: vi.fn(),
  recordCashOutMock: vi.fn(),
  getContractSpendMock: vi.fn(),
  getCurrentBalanceUsdMock: vi.fn(),
}));

vi.mock('../utils/id', () => ({ createId: mocks.createIdMock }));
vi.mock('./agent-contract-store', () => ({
  createAgentContractStore: vi.fn(() => ({
    getContractSpend: mocks.getContractSpendMock,
  })),
}));
vi.mock('../finance/company-cash-ledger', () => ({
  createCompanyCashLedger: vi.fn(() => ({
    getCurrentBalanceUsd: mocks.getCurrentBalanceUsdMock,
  })),
}));
vi.mock('../finance/company-cash-operations', () => ({
  createCompanyCashOperations: vi.fn(() => ({
    recordCashIn: mocks.recordCashInMock,
    recordCashOut: mocks.recordCashOutMock,
  })),
}));

function createMockDb() {
  const updateValues: any[] = [];
  const insertValues: any[] = [];
  
  const db: any = {
    query: {
      agentExecutionContracts: {
        findFirst: vi.fn(),
      },
    },
    // Drizzle API: db.update(table).set(values).where(condition)
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockImplementation((values) => {
        updateValues.push(values);
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      }),
    }),
    // Drizzle API: db.insert(table).values(data).returning()
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation((values) => {
        insertValues.push(values);
        return {
          returning: vi.fn().mockResolvedValue({}),
        };
      }),
    }),
    _updateValues: updateValues,
    _insertValues: insertValues,
  };
  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentBalanceUsdMock.mockResolvedValue(0);
  mocks.recordCashInMock.mockResolvedValue(undefined);
  mocks.recordCashOutMock.mockResolvedValue(undefined);
});

function setupDbWithContract(db: any, contract: any) {
  db.query.agentExecutionContracts.findFirst.mockResolvedValue(contract);
}

describe('renewAgentContract', () => {
  it('throws when no active contract exists for agent', async () => {
    const db = createMockDb();
    setupDbWithContract(db, null);
    await expect(
      renewAgentContract(db, { agentId: 'agent-1', newBudgetUsd: 500 }),
    ).rejects.toThrow('No active contract for agent: agent-1');
  });

  it('creates new contract with updated budget when balance is sufficient and no refund needed', async () => {
    const now = Date.now();
    const activeContract = {
      id: 'contract-1',
      agentId: 'agent-1',
      budgetUsd: 500,
      fundedAt: null,
      autoRenew: 1,
      startsAt: now - 1000,
      endsAt: now + 1000,
    };
    const db = createMockDb();
    setupDbWithContract(db, activeContract);
    mocks.getCurrentBalanceUsdMock.mockResolvedValue(600);
    mocks.getContractSpendMock.mockResolvedValue(0);

    await renewAgentContract(db, { agentId: 'agent-1', newBudgetUsd: 600 });

    expect(mocks.recordCashInMock).not.toHaveBeenCalled();
    expect(mocks.recordCashOutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent-contract-renewal-funding',
        amountUsd: 600,
        referenceType: 'agent-execution-contract',
      }),
    );
  });

  it('records refund cash-in when prior contract was funded and has refundable amount', async () => {
    const now = Date.now();
    const activeContract = {
      id: 'contract-1',
      agentId: 'agent-1',
      budgetUsd: 500,
      fundedAt: now - 86400000,
      autoRenew: 1,
      startsAt: now - 1000,
      endsAt: now + 1000,
    };
    const db = createMockDb();
    setupDbWithContract(db, activeContract);
    mocks.getCurrentBalanceUsdMock.mockResolvedValue(200);
    mocks.getContractSpendMock.mockResolvedValue(200);

    await renewAgentContract(db, { agentId: 'agent-1', newBudgetUsd: 500 });

    expect(mocks.recordCashInMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent-contract-renewal-refund',
        amountUsd: 300,
        referenceId: 'contract-1',
      }),
    );
    expect(mocks.recordCashOutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent-contract-renewal-funding',
        amountUsd: 500,
      }),
    );
  });

  it('throws when company cash balance (plus refund) is insufficient for new budget', async () => {
    const now = Date.now();
    const activeContract = {
      id: 'contract-1',
      agentId: 'agent-1',
      budgetUsd: 500,
      fundedAt: now - 86400000,
      autoRenew: 1,
      startsAt: now - 1000,
      endsAt: now + 1000,
    };
    const db = createMockDb();
    setupDbWithContract(db, activeContract);
    mocks.getCurrentBalanceUsdMock.mockResolvedValue(50);
    mocks.getContractSpendMock.mockResolvedValue(450);

    await expect(
      renewAgentContract(db, { agentId: 'agent-1', newBudgetUsd: 1000 }),
    ).rejects.toThrow('Insufficient company cash to renew this contract');
  });

  it('closes old contract and inserts new contract with correct fields', async () => {
    const now = Date.now();
    const activeContract = {
      id: 'contract-1',
      agentId: 'agent-1',
      budgetUsd: 300,
      fundedAt: null,
      autoRenew: 1,
      startsAt: now - 1000,
      endsAt: now + 1000,
    };
    const db = createMockDb();
    setupDbWithContract(db, activeContract);
    mocks.getCurrentBalanceUsdMock.mockResolvedValue(500);
    mocks.getContractSpendMock.mockResolvedValue(0);

    const result = await renewAgentContract(db, { agentId: 'agent-1', newBudgetUsd: 400 });

    expect(result).toMatchObject({
      agentId: 'agent-1',
      previousContractId: 'contract-1',
      newContractId: 'new-contract-id',
      previousBudgetUsd: 300,
      previousSpentUsd: 0,
      refundedUsd: 0,
      newBudgetUsd: 400,
    });
    expect(result.endsAt - result.startsAt).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('sets fundedAt on new contract after cash-out recording', async () => {
    const now = Date.now();
    const activeContract = {
      id: 'contract-1',
      agentId: 'agent-1',
      budgetUsd: 500,
      fundedAt: now - 86400000,
      autoRenew: 1,
      startsAt: now - 1000,
      endsAt: now + 1000,
    };
    const db = createMockDb();
    setupDbWithContract(db, activeContract);
    mocks.getCurrentBalanceUsdMock.mockResolvedValue(200);
    mocks.getContractSpendMock.mockResolvedValue(200);

    await renewAgentContract(db, { agentId: 'agent-1', newBudgetUsd: 500 });

    expect(db._updateValues.length).toBe(2);
    const secondUpdateValues = db._updateValues[1];
    expect(secondUpdateValues).toHaveProperty('fundedAt');
    expect(typeof secondUpdateValues.fundedAt).toBe('number');
  });

  it('keeps autoRenew flag from original contract on new contract', async () => {
    const now = Date.now();
    const activeContract = {
      id: 'contract-1',
      agentId: 'agent-1',
      budgetUsd: 500,
      fundedAt: null,
      autoRenew: 0,
      startsAt: now - 1000,
      endsAt: now + 1000,
    };
    const db = createMockDb();
    setupDbWithContract(db, activeContract);
    mocks.getCurrentBalanceUsdMock.mockResolvedValue(500);
    mocks.getContractSpendMock.mockResolvedValue(0);

    await renewAgentContract(db, { agentId: 'agent-1', newBudgetUsd: 500 });

    expect(db._insertValues.length).toBe(1);
    expect(db._insertValues[0]).toHaveProperty('autoRenew', 0);
  });
});
