import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { Database } from '../database/schema';
import { WEEK_MS } from '../shared/constants';

function isSQL(x: unknown): x is { queryChunks: unknown[] } {
  return typeof x === 'object' && x !== null && !Array.isArray(x) && 'queryChunks' in x;
}
function isStringChunk(x: unknown): boolean {
  return typeof x === 'object' && x !== null && !Array.isArray(x) && 'value' in x && Array.isArray((x as { value: unknown }).value);
}
function extractConditions(sql: unknown): Array<{ colName: string; value: unknown }> {
  if (!isSQL(sql)) return [];
  const result: Array<{ colName: string; value: unknown }> = [];
  const chunks = sql.queryChunks ?? [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    // Skip plain string delimiters: "(", ")", "and", etc.
    if (isStringChunk(chunk)) continue;
    // Recurse into nested SQL objects (e.g. the outer "and" wrapper → inner eq/lte/gte wrappers)
    if (isSQL(chunk) && chunk.queryChunks?.length) {
      result.push(...extractConditions(chunk));
      continue;
    }
    // Object chunk marks a column reference (config.name = column name)
    const colName = (chunk as { config?: { name?: string } })?.config?.name;
    if (!colName) continue;
    // Next non-string-delimiter chunk is the value (String, Number, or StringChunk with value[])
    let j = i + 1;
    while (j < chunks.length && isStringChunk(chunks[j])) j++;
    if (j >= chunks.length) break;
    const valChunk = chunks[j];
    let value: unknown;
    if (typeof valChunk === 'string') {
      value = valChunk;
    } else if (typeof valChunk === 'number') {
      value = valChunk;
    } else if (typeof valChunk === 'object' && valChunk !== null && !isSQL(valChunk) && !isStringChunk(valChunk) && 'value' in valChunk) {
      // Object with { value: string } or { value: number } (e.g. Drizzle String/Number wrappers)
      value = (valChunk as { value: unknown }).value;
      // Fallback: if value is undefined, try toString()
      if (value === undefined) value = String(valChunk);
    } else {
      i = j;
      continue;
    }
    result.push({ colName, value });
    i = j;
  }
  return result;
}
function snakeToCamel(s: string): string { return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); }
function extractWhere(where: unknown): Record<string, unknown> {
  if (!where) return {};
  return Object.fromEntries(extractConditions(where).map(({ colName, value }) => [snakeToCamel(colName), value]));
}

interface AgentRow { id: string; executionState: 'idle' | 'running' | 'absent'; lastExecutionError: string | null; lastExecutionErrorAt: number | null; updatedAt: number; }
interface ContractRow { id: string; agentId: string; budgetUsd: number; autoRenew: number; fundedAt: number | null; startsAt: number; endsAt: number; createdAt: number; }
interface StepRow { id: string; contractId: string; agentId: string; llmProfileId: string; modelKey: string; kind: string; inputTokens: number; cachedInputTokens: number; outputTokens: number; inputPerMillionUsd: number; inputCachePerMillionUsd: number; outputPerMillionUsd: number; contractCostMultiplier: number; costUsd: number; createdAt: number; }
interface ModelPriceRow { modelKey: string; inputPerMillionUsd: number; inputCachePerMillionUsd: number; outputPerMillionUsd: number; }
interface ProfileRow { id: string; name: string; contractCostMultiplier: number; isEnabled: number; }
interface MockCollections { agents: Map<string, AgentRow>; contracts: Map<string, ContractRow>; steps: Map<string, StepRow>; modelPrices: Map<string, ModelPriceRow>; profiles: Map<string, ProfileRow>; }

function createMockDb(collections: MockCollections) {
  let _setVals: unknown = null;
  const db = {
    query: {
      agents: {
        findFirst: vi.fn(async (opts?: { where?: unknown }) => {
          const wh = extractWhere(opts?.where);
          for (const a of collections.agents.values()) {
            if (wh.id && a.id !== wh.id) continue;
            return a;
          }
          return undefined;
        }),
      },
      agentExecutionContracts: {
        findFirst: vi.fn(async (opts?: { where?: unknown }) => {
const wh = extractWhere(opts?.where);
          const rows = [...collections.contracts.values()].filter(c => {
            if (wh.agentId && c.agentId !== wh.agentId) return false;
            if (wh.startsAt && c.startsAt > (wh.startsAt as number)) return false;
            if (wh.endsAt && c.endsAt < (wh.endsAt as number)) return false;
            return true;
          });
          return rows[0] ?? undefined;
        }),
      },
      llmModelPrices: {
        findFirst: vi.fn(async (opts?: { where?: unknown }) => {
          const wh = extractWhere(opts?.where);
          for (const p of collections.modelPrices.values()) {
            if (wh.modelKey && p.modelKey !== wh.modelKey) continue;
            return p;
          }
          return undefined;
        }),
      },
      llmProfiles: {
        findFirst: vi.fn(async (opts?: { where?: unknown }) => {
          const wh = extractWhere(opts?.where);
          for (const p of collections.profiles.values()) {
            if (wh.id && p.id !== wh.id) continue;
            return p;
          }
          return undefined;
        }),
      },
      agentExecutionSteps: {
        findMany: vi.fn(async (opts?: { where?: unknown; limit?: number }) => {
          const wh = extractWhere(opts?.where);
          return [...collections.steps.values()]
            .filter(s => !wh.agentId || s.agentId === wh.agentId)
            .slice(0, opts?.limit ?? 100);
        }),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async (where: unknown) => {
          const wh = extractWhere(where);
          if (wh.contractId) {
            const steps = [...collections.steps.values()].filter(s => s.contractId === wh.contractId);
            const total = steps.reduce((sum, s) => sum + s.costUsd, 0);
            return [{ total }];
          }
          return [{ total: 0 }];
        }),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (vals: unknown) => {
        const v = vals as Record<string, unknown>;
        if (!v.id || !v.agentId) return;
        if (v.budgetUsd !== undefined) collections.contracts.set(v.id as string, v as unknown as ContractRow);
        if (v.costUsd !== undefined) collections.steps.set(v.id as string, v as unknown as StepRow);
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((vals: unknown) => {
        _setVals = vals;
        return {
          where: vi.fn(async (where: unknown) => {
            const wh = extractWhere(where);
            const setVals = _setVals as Record<string, unknown>;
            if (wh.id && collections.agents.has(wh.id as string)) {
              const existing = collections.agents.get(wh.id as string)!;
              const updated = { ...existing };
              for (const [k, v] of Object.entries(setVals)) { (updated as Record<string, unknown>)[k] = v; }
              collections.agents.set(wh.id as string, updated);
            }
            if (wh.id && collections.contracts.has(wh.id as string)) {
              const existing = collections.contracts.get(wh.id as string)!;
              const updated = { ...existing };
              for (const [k, v] of Object.entries(setVals)) { (updated as Record<string, unknown>)[k] = v; }
              collections.contracts.set(wh.id as string, updated);
            }
          }),
        };
      }),
    })),
  };
  return { db, collections };
}

let createAgentContractStore: (db: unknown) => ReturnType<typeof import('./agent-contract-store').createAgentContractStore>;
let collections: MockCollections;

beforeEach(async () => {
  vi.resetModules();
  collections = { agents: new Map(), contracts: new Map(), steps: new Map(), modelPrices: new Map(), profiles: new Map() };
  createAgentContractStore = (await import('./agent-contract-store')).createAgentContractStore;
});

function makeAgent(overrides: Partial<AgentRow> = {}) {
  const a: AgentRow = { id: 'agent-1', executionState: 'idle', lastExecutionError: null, lastExecutionErrorAt: null, updatedAt: Date.now(), ...overrides };
  collections.agents.set(a.id, a);
  return a;
}
function makeContract(overrides: Partial<ContractRow> = {}) {
  const now = Date.now();
  const c: ContractRow = { id: 'contract-1', agentId: 'agent-1', budgetUsd: 5, autoRenew: 1, fundedAt: null, startsAt: now - 1000, endsAt: now + WEEK_MS - 1000, createdAt: now - 1000, ...overrides };
  collections.contracts.set(c.id, c);
  return c;
}
function makeStep(overrides: Partial<StepRow> = {}) {
  const s: StepRow = { id: 'step-1', contractId: 'contract-1', agentId: 'agent-1', llmProfileId: 'profile-1', modelKey: 'gpt-4o', kind: 'agent-step', inputTokens: 1000, cachedInputTokens: 0, outputTokens: 500, inputPerMillionUsd: 2.5, inputCachePerMillionUsd: 0, outputPerMillionUsd: 10, contractCostMultiplier: 1, costUsd: 0.0075, createdAt: Date.now(), ...overrides };
  collections.steps.set(s.id, s);
  return s;
}
function makeProfile(overrides: Partial<ProfileRow> = {}) {
  const p: ProfileRow = { id: 'profile-1', name: 'Standard', contractCostMultiplier: 1, isEnabled: 1, ...overrides };
  collections.profiles.set(p.id, p);
  return p;
}
function makeModelPrice(overrides: Partial<ModelPriceRow> = {}) {
  const p: ModelPriceRow = { modelKey: 'gpt-4o', inputPerMillionUsd: 2.5, inputCachePerMillionUsd: 0, outputPerMillionUsd: 10, ...overrides };
  collections.modelPrices.set(p.modelKey, p);
  return p;
}

describe('agent-contract-store', () => {
  describe('getExecutionState', () => {
    test('returns idle when agent not found', async () => {
      const { db, collections: c2 } = createMockDb(collections);
      const store = createAgentContractStore(db);
      expect(await store.getExecutionState('nonexistent')).toBe('idle');
    });
    test('returns stored executionState', async () => {
      makeAgent({ id: 'a-running', executionState: 'running' });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      expect(await store.getExecutionState('a-running')).toBe('running');
    });
    test('returns absent as-is', async () => {
      makeAgent({ id: 'a-absent', executionState: 'absent' });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      expect(await store.getExecutionState('a-absent')).toBe('absent');
    });
  });

  describe('setExecutionState', () => {
    test('sets running and clears error fields', async () => {
      makeAgent({ id: 'a1', lastExecutionError: 'old', lastExecutionErrorAt: 1000 });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      await store.setExecutionState('a1', 'running');
      expect(collections.agents.get('a1')!.executionState).toBe('running');
      expect(collections.agents.get('a1')!.lastExecutionError).toBeNull();
      expect(collections.agents.get('a1')!.lastExecutionErrorAt).toBeNull();
    });
    test('sets absent and clears error fields', async () => {
      makeAgent({ id: 'a2', lastExecutionError: 'crash', lastExecutionErrorAt: 2000 });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      await store.setExecutionState('a2', 'absent');
      expect(collections.agents.get('a2')!.executionState).toBe('absent');
      expect(collections.agents.get('a2')!.lastExecutionError).toBeNull();
      expect(collections.agents.get('a2')!.lastExecutionErrorAt).toBeNull();
    });
    test('sets idle and clears error fields', async () => {
      makeAgent({ id: 'a-idle-test', lastExecutionError: 'old', lastExecutionErrorAt: 3000 });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      await store.setExecutionState('a-idle-test', 'idle');
      expect(collections.agents.get('a-idle-test')!.executionState).toBe('idle');
      expect(collections.agents.get('a-idle-test')!.lastExecutionError).toBeNull();
    });
  });

  describe('setExecutionAbsent', () => {
    test('sets absent with error and timestamp', async () => {
      makeAgent({ id: 'a3' });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      const before = Date.now();
      await store.setExecutionAbsent('a3', 'Connection timeout');
      expect(collections.agents.get('a3')!.executionState).toBe('absent');
      expect(collections.agents.get('a3')!.lastExecutionError).toBe('Connection timeout');
      expect(collections.agents.get('a3')!.lastExecutionErrorAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getContractSpend', () => {
    test('returns 0 when no steps', async () => {
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      expect(await store.getContractSpend('c-no-steps')).toBe(0);
    });
    test('sums all matching step costs', async () => {
      makeContract({ id: 'c1', budgetUsd: 20 });
      makeStep({ id: 's1', contractId: 'c1', costUsd: 0.005 });
      makeStep({ id: 's2', contractId: 'c1', costUsd: 0.003 });
      makeStep({ id: 's3', contractId: 'c1', costUsd: 0.002 });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      expect(await store.getContractSpend('c1')).toBeCloseTo(0.01, 5);
    });
    test('ignores steps from other contracts', async () => {
      makeContract({ id: 'ca', budgetUsd: 5 });
      makeContract({ id: 'cb', agentId: 'other', budgetUsd: 5 });
      makeStep({ id: 's-other', contractId: 'cb', costUsd: 9.99 });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      expect(await store.getContractSpend('ca')).toBe(0);
    });
  });

  describe('getUsagePricing', () => {
    test('throws when profile not found', async () => {
      makeModelPrice({ modelKey: 'gpt-4o' });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      await expect(store.getUsagePricing({ pricingModelKey: 'gpt-4o', profileId: 'missing' })).rejects.toThrow('LLM profile not found');
    });
    test('returns model price and profile multiplier', async () => {
      makeModelPrice({ modelKey: 'gpt-4o', inputPerMillionUsd: 2.5, outputPerMillionUsd: 10, inputCachePerMillionUsd: 1.25 });
      makeProfile({ id: 'p-premium', contractCostMultiplier: 1.8 });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      const result = await store.getUsagePricing({ pricingModelKey: 'gpt-4o', profileId: 'p-premium' });
      expect(result.modelPrice?.modelKey).toBe('gpt-4o');
      expect(result.modelPrice?.inputPerMillionUsd).toBe(2.5);
      expect(result.contractCostMultiplier).toBe(1.8);
    });
  });

  describe('recordAgentStep', () => {
    test('creates step and returns id + timestamp', async () => {
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      const result = await store.recordAgentStep({
        agentId: 'sa', contractId: 'sc', llmProfileId: 'sp', modelKey: 'gpt-4o-mini',
        kind: 'agent-step', inputTokens: 500, cachedInputTokens: 100, outputTokens: 250,
        inputPerMillionUsd: 0.15, inputCachePerMillionUsd: 0.075, outputPerMillionUsd: 0.6,
        contractCostMultiplier: 1, costUsd: 0.000225,
      });
      expect(result.stepId).toBeTruthy();
      expect(typeof result.createdAt).toBe('number');
      const step = collections.steps.get(result.stepId);
      expect(step?.agentId).toBe('sa');
      expect(step?.modelKey).toBe('gpt-4o-mini');
      expect(step?.inputTokens).toBe(500);
      expect(step?.cachedInputTokens).toBe(100);
    });
    test('records all step kinds', async () => {
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      for (const kind of ['agent-step', 'om', 'ltm'] as const) {
        const result = await store.recordAgentStep({
          agentId: 'sa', contractId: 'sc', llmProfileId: 'sp', modelKey: 'gpt-4o',
          kind, inputTokens: 100, cachedInputTokens: 0, outputTokens: 50,
          inputPerMillionUsd: 2.5, inputCachePerMillionUsd: 0, outputPerMillionUsd: 10,
          contractCostMultiplier: 1, costUsd: 0.001,
        });
        expect(collections.steps.get(result.stepId)?.kind).toBe(kind);
      }
    });
  });

  describe('listRecentSteps', () => {
    test('returns empty when no steps', async () => {
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      expect(await store.listRecentSteps('a-none', 10)).toHaveLength(0);
    });
    test('returns steps for agent limited by count', async () => {
      makeStep({ id: 'sx', agentId: 'a-steps', contractId: 'c1', costUsd: 0.001 });
      makeStep({ id: 'sy', agentId: 'a-steps', contractId: 'c1', costUsd: 0.002 });
      makeStep({ id: 'sz', agentId: 'a-steps', contractId: 'c1', costUsd: 0.003 });
      makeStep({ id: 'so', agentId: 'other', contractId: 'c2', costUsd: 1.0 });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      const result = await store.listRecentSteps('a-steps', 2);
      expect(result).toHaveLength(2);
    });
  });

  describe('refundActiveContractBalance', () => {
    test('returns null when no active contract', async () => {
      makeAgent({ id: 'a-no-c' });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      expect(await store.refundActiveContractBalance('a-no-c')).toBeNull();
    });
    test('returns null for unfunded contract (no cash to refund)', async () => {
      const now = Date.now();
      makeContract({ id: 'c-unfunded', agentId: 'a-un', fundedAt: null, budgetUsd: 10, startsAt: now - 100, endsAt: now + WEEK_MS });
      makeAgent({ id: 'a-un' });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      expect(await store.refundActiveContractBalance('a-un')).toBeNull();
    });
    test('returns refund of 0 when budget equals spend (nothing to refund)', async () => {
      const now = Date.now();
      makeContract({ id: 'c-full', agentId: 'a-full', fundedAt: now - 1000, budgetUsd: 10, startsAt: now - 100, endsAt: now + WEEK_MS });
      makeAgent({ id: 'a-full' });
      makeStep({ id: 'step-full', agentId: 'a-full', contractId: 'c-full', costUsd: 10 });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      const result = await store.refundActiveContractBalance('a-full');
      expect(result).not.toBeNull();
      expect(result!.contractId).toBe('c-full');
      expect(result!.refundedUsd).toBe(0);
    });
  });

  describe('getRunnableContract', () => {
    test('returns null when no contracts at all', async () => {
      makeAgent({ id: 'a-no-contracts' });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      expect(await store.getRunnableContract('a-no-contracts')).toBeNull();
    });
    test('returns funded active contract when one exists', async () => {
      const now = Date.now();
      makeAgent({ id: 'a-runnable' });
      makeContract({ id: 'c-runnable', agentId: 'a-runnable', fundedAt: now, startsAt: now - 100, endsAt: now + 1_000_000 });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      const result = await store.getRunnableContract('a-runnable');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('c-runnable');
    });
    test('returns null when active contract is unfunded (insufficient cash)', async () => {
      const now = Date.now();
      makeAgent({ id: 'a-unfunded' });
      makeContract({ id: 'c-unfunded', agentId: 'a-unfunded', fundedAt: null, startsAt: now - 100, endsAt: now + 1_000_000 });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      const result = await store.getRunnableContract('a-unfunded');
      expect(result).toBeNull();
    });
    test('returns null when latest contract autoRenew is false', async () => {
      const now = Date.now();
      makeAgent({ id: 'a-no-renew' });
      makeContract({ id: 'c-no-renew', agentId: 'a-no-renew', autoRenew: 0, startsAt: now - 200_000, endsAt: now - 100_000 });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      expect(await store.getRunnableContract('a-no-renew')).toBeNull();
    });
    test('returns null when latest contract not yet ended', async () => {
      const now = Date.now();
      makeAgent({ id: 'a-not-ended' });
      makeContract({ id: 'c-not-ended', agentId: 'a-not-ended', startsAt: now - 100, endsAt: now + 1_000_000 });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      expect(await store.getRunnableContract('a-not-ended')).toBeNull();
    });
  });

  describe('renewContract', () => {
    test('returns null when no contracts exist', async () => {
      makeAgent({ id: 'a-none' });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      expect(await store.renewContract('a-none')).toBeNull();
    });
    test('returns null when latest contract autoRenew is false', async () => {
      const now = Date.now();
      makeAgent({ id: 'a-no-renew' });
      makeContract({ id: 'c-no-renew', agentId: 'a-no-renew', autoRenew: 0, endsAt: now - 1000 });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      expect(await store.renewContract('a-no-renew')).toBeNull();
    });
    test('returns null when latest contract endsAt is in the future', async () => {
      const now = Date.now();
      makeAgent({ id: 'a-future' });
      makeContract({ id: 'c-future', agentId: 'a-future', autoRenew: 1, endsAt: now + 1_000_000 });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      expect(await store.renewContract('a-future')).toBeNull();
    });
    test('creates new contract extending previous contract by one week', async () => {
      const now = Date.now();
      const previousEnd = now - 1000;
      makeAgent({ id: 'a-renew' });
      makeContract({ id: 'c-previous', agentId: 'a-renew', autoRenew: 1, budgetUsd: 5, endsAt: previousEnd });
      const { db, collections: c2 } = createMockDb(collections);
      const origInsert = db.insert;
      db.insert = vi.fn((table) => ({
        values: vi.fn(async (vals) => {
          const v = vals as Record<string, unknown>;
          c2.contracts.set(v.id as string, v as never);
        }),
      })) as unknown as typeof db.insert;
      db.transaction = vi.fn(async (fn) => {
        await fn({
          insert: db.insert,
          update: db.update,
          select: db.select,
        });
      });
      const store = createAgentContractStore(db);
      const result = await store.renewContract('a-renew');
      expect(result).not.toBeNull();
      expect(result!.agentId).toBe('a-renew');
      expect(result!.startsAt).toBe(previousEnd);
      expect(result!.endsAt).toBe(previousEnd + WEEK_MS);
      expect(result!.budgetUsd).toBe(5);
      expect(result!.autoRenew).toBe(1);
    });
  });

  describe('fundContractIfNeeded', () => {
    test('returns contract unchanged when already funded', async () => {
      const now = Date.now();
      makeAgent({ id: 'a-funded' });
      const contract = makeContract({ id: 'c-funded', agentId: 'a-funded', fundedAt: now, budgetUsd: 10 });
      const { db } = createMockDb(collections);
      const store = createAgentContractStore(db);
      const result = await store.fundContractIfNeeded(contract);
      expect(result).not.toBeNull();
      expect(result!.fundedAt).toBe(now);
    });
  });

  });
