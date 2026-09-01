/**
 * Unit tests for planNextAttempt (agent-runner-plan-next-attempt.ts).
 *
 * Tests the three return branches:
 *   - { execute: 'idle' } when no contract or budget exhausted
 *   - { execute: false; delayMs } when instant=false and no pending work
 *   - { execute: true; contractId; delayMs } when ready to run
 *
 * Each test constructs its own mocks inline.
 */
import { describe, expect, it, vi } from 'vitest';
import { planNextAttempt } from './agent-runner-plan-next-attempt';

// ─── Mock helpers ────────────────────────────────────────────────────────────────

function mockStore(
  overrides: Partial<{
    getRunnableContract: ReturnType<typeof vi.fn>;
    getContractSpend: ReturnType<typeof vi.fn>;
  }> = {},
) {
  return {
    getRunnableContract: vi.fn().mockResolvedValue(null),
    getContractSpend: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

function mockUsage(
  overrides: Partial<{
    estimateStepCostUsd: ReturnType<typeof vi.fn>;
  }> = {},
) {
  return {
    estimateStepCostUsd: vi.fn().mockResolvedValue(1.0),
    ...overrides,
  };
}

function mockSystemSettings(
  overrides: Partial<{
    getSettings: ReturnType<typeof vi.fn>;
  }> = {},
) {
  return {
    getSettings: vi.fn().mockResolvedValue({ stepDelayEnabled: true }),
    ...overrides,
  };
}

function mockScheduler(
  overrides: Partial<{
    getState: ReturnType<typeof vi.fn>;
    resetBackoff: ReturnType<typeof vi.fn>;
  }> = {},
) {
  return {
    getState: vi.fn().mockReturnValue({ instant: false }),
    resetBackoff: vi.fn(),
    ...overrides,
  };
}

function makeDeps(
  overrides: {
    runtimeId?: string;
    store?: ReturnType<typeof mockStore>;
    usage?: ReturnType<typeof mockUsage>;
    systemSettings?: ReturnType<typeof mockSystemSettings>;
    scheduler?: ReturnType<typeof mockScheduler>;
    calculateBudgetDelayMs?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return {
    runtimeId: 'runtime-1',
    store: mockStore(),
    usage: mockUsage(),
    systemSettings: mockSystemSettings(),
    scheduler: mockScheduler(),
    ...overrides,
  };
}

function makeContract(
  overrides: Partial<{
    id: string;
    budgetUsd: number;
    endsAt: number;
  }> = {},
) {
  return {
    id: 'contract-1',
    budgetUsd: 100,
    endsAt: Date.now() + 86_400_000,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('planNextAttempt', () => {
  it('returns idle when no contract exists', async () => {
    const store = mockStore({
      getRunnableContract: vi.fn().mockResolvedValue(null),
    });
    const deps = makeDeps({ store }) as any;
    const result = await planNextAttempt(deps);
    expect(result).toEqual({ execute: 'idle' });
  });

  it('returns idle when remaining budget is less than estimated step cost', async () => {
    const contract = makeContract({ budgetUsd: 10 });
    const store = mockStore({
      getRunnableContract: vi.fn().mockResolvedValue(contract),
      getContractSpend: vi.fn().mockResolvedValue(9), // remaining = 1
    });
    const usage = mockUsage({
      estimateStepCostUsd: vi.fn().mockResolvedValue(2.0), // cost = 2 > remaining = 1
    });
    const deps = makeDeps({ store, usage }) as any;
    const result = await planNextAttempt(deps);
    expect(result).toEqual({ execute: 'idle' });
  });

  it('returns idle when budget is exactly exhausted (remaining = 0)', async () => {
    const contract = makeContract({ budgetUsd: 5 });
    const store = mockStore({
      getRunnableContract: vi.fn().mockResolvedValue(contract),
      getContractSpend: vi.fn().mockResolvedValue(5), // remaining = 0
    });
    const usage = mockUsage({
      estimateStepCostUsd: vi.fn().mockResolvedValue(1.0), // cost = 1 > remaining = 0
    });
    const deps = makeDeps({ store, usage }) as any;
    const result = await planNextAttempt(deps);
    expect(result).toEqual({ execute: 'idle' });
  });

  it('does not reset backoff when returning idle (no contract)', async () => {
    const store = mockStore({
      getRunnableContract: vi.fn().mockResolvedValue(null),
    });
    const scheduler = mockScheduler();
    const deps = makeDeps({ store, scheduler }) as any;
    await planNextAttempt(deps);
    expect(scheduler.resetBackoff).not.toHaveBeenCalled();
  });

  it('does not reset backoff when returning idle (budget exhausted)', async () => {
    const contract = makeContract({ budgetUsd: 1 });
    const store = mockStore({
      getRunnableContract: vi.fn().mockResolvedValue(contract),
      getContractSpend: vi.fn().mockResolvedValue(1),
    });
    const usage = mockUsage({
      estimateStepCostUsd: vi.fn().mockResolvedValue(2.0),
    });
    const scheduler = mockScheduler();
    const deps = makeDeps({ store, usage, scheduler }) as any;
    await planNextAttempt(deps);
    expect(scheduler.resetBackoff).not.toHaveBeenCalled();
  });

  it('returns execute:true with delayMs=0 when instant is true', async () => {
    const contract = makeContract();
    const store = mockStore({
      getRunnableContract: vi.fn().mockResolvedValue(contract),
      getContractSpend: vi.fn().mockResolvedValue(0),
    });
    const scheduler = mockScheduler({
      getState: vi.fn().mockReturnValue({ instant: true }),
    });
    const deps = makeDeps({ store, scheduler }) as any;
    const result = await planNextAttempt(deps);
    expect(result).toEqual({
      execute: true,
      contractId: 'contract-1',
      delayMs: 0,
    });
  });

  it('returns execute:true with delayMs=0 when stepDelayEnabled is false', async () => {
    const contract = makeContract();
    const store = mockStore({
      getRunnableContract: vi.fn().mockResolvedValue(contract),
      getContractSpend: vi.fn().mockResolvedValue(0),
    });
    const systemSettings = mockSystemSettings({
      getSettings: vi.fn().mockResolvedValue({ stepDelayEnabled: false }),
    });
    const deps = makeDeps({ store, systemSettings }) as any;
    const result = await planNextAttempt(deps);
    expect(result).toEqual({
      execute: true,
      contractId: 'contract-1',
      delayMs: 0,
    });
  });

  it('returns execute:true with positive delayMs when instant=false and stepDelayEnabled=true', async () => {
    const contract = makeContract({ budgetUsd: 100, endsAt: Date.now() + 100 });
    const store = mockStore({
      getRunnableContract: vi.fn().mockResolvedValue(contract),
      getContractSpend: vi.fn().mockResolvedValue(0),
    });
    const usage = mockUsage({
      estimateStepCostUsd: vi.fn().mockResolvedValue(0.5),
    });
    const systemSettings = mockSystemSettings({
      getSettings: vi.fn().mockResolvedValue({ stepDelayEnabled: true }),
    });
    const scheduler = mockScheduler();
    const calculateBudgetDelayMs = vi.fn().mockReturnValue(30_000);
    const deps = makeDeps({
      store,
      usage,
      systemSettings,
      scheduler,
      calculateBudgetDelayMs,
    }) as any;
    const result = await planNextAttempt(deps);
    expect(result).toEqual({
      execute: true,
      contractId: 'contract-1',
      delayMs: 30_000,
    });
  });

  it('resets scheduler backoff on successful execution plan', async () => {
    const contract = makeContract();
    const store = mockStore({
      getRunnableContract: vi.fn().mockResolvedValue(contract),
      getContractSpend: vi.fn().mockResolvedValue(0),
    });
    const scheduler = mockScheduler();
    const deps = makeDeps({ store, scheduler }) as any;
    await planNextAttempt(deps);
    expect(scheduler.resetBackoff).toHaveBeenCalledTimes(1);
  });

  it('returns the correct contractId', async () => {
    const contract = makeContract({ id: 'my-contract-id' });
    const store = mockStore({
      getRunnableContract: vi.fn().mockResolvedValue(contract),
      getContractSpend: vi.fn().mockResolvedValue(0),
    });
    const scheduler = mockScheduler({
      getState: vi.fn().mockReturnValue({ instant: true }),
    });
    const deps = makeDeps({ store, scheduler }) as any;
    const result = await planNextAttempt(deps);
    expect(result).toEqual({
      execute: true,
      contractId: 'my-contract-id',
      delayMs: 0,
    });
  });

  it('uses default calculateBudgetDelayMs when not provided', async () => {
    const contract = makeContract({ budgetUsd: 100, endsAt: Date.now() + 100 });
    const store = mockStore({
      getRunnableContract: vi.fn().mockResolvedValue(contract),
      getContractSpend: vi.fn().mockResolvedValue(0),
    });
    const usage = mockUsage({
      estimateStepCostUsd: vi.fn().mockResolvedValue(0.5),
    });
    const systemSettings = mockSystemSettings({
      getSettings: vi.fn().mockResolvedValue({ stepDelayEnabled: true }),
    });
    const scheduler = mockScheduler();
    const deps = makeDeps({ store, usage, systemSettings, scheduler }) as any;
    const result = (await planNextAttempt(deps)) as any;
    // Default calculateBudgetDelayMs computes a positive value
    expect(result.execute).toBe(true);
    expect(typeof result.delayMs).toBe('number');
    expect(result.delayMs).toBeGreaterThan(0);
  });

  it('handles null estimateStepCostUsd result as no cost constraint', async () => {
    const contract = makeContract({ budgetUsd: 10 });
    const store = mockStore({
      getRunnableContract: vi.fn().mockResolvedValue(contract),
      getContractSpend: vi.fn().mockResolvedValue(0),
    });
    const usage = mockUsage({
      estimateStepCostUsd: vi.fn().mockResolvedValue(null),
    });
    const scheduler = mockScheduler({
      getState: vi.fn().mockReturnValue({ instant: true }),
    });
    const deps = makeDeps({ store, usage, scheduler }) as any;
    const result = await planNextAttempt(deps);
    expect(result).toEqual({
      execute: true,
      contractId: 'contract-1',
      delayMs: 0,
    });
  });

  it('handles zero spent (brand new contract)', async () => {
    const contract = makeContract({ budgetUsd: 100 });
    const store = mockStore({
      getRunnableContract: vi.fn().mockResolvedValue(contract),
      getContractSpend: vi.fn().mockResolvedValue(0),
    });
    const scheduler = mockScheduler({
      getState: vi.fn().mockReturnValue({ instant: true }),
    });
    const deps = makeDeps({ store, scheduler }) as any;
    const result = await planNextAttempt(deps);
    expect(result).toEqual({
      execute: true,
      contractId: 'contract-1',
      delayMs: 0,
    });
  });
});
