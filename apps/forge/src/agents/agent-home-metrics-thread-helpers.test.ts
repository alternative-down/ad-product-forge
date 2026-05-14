import { describe, expect, it, vi } from 'vitest';
import { buildAverageStepIntervalMs, readLatestThreadDetails, readAgentRuntimeMemory } from './agent-home-metrics-thread-helpers';

// ---------------------------------------------------------------------------
// vi.mock — hoisted. All mock fns are declared inside factory bodies so there
// is no TDZ issue with module-level variable declarations before vi.mock.
// ---------------------------------------------------------------------------

vi.mock('@forge-runtime/core', () => {
  const forgeDebug = vi.fn();
  return {
    createClient: vi.fn().mockReturnValue({
      execute: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    }),
    LibsqlConversationStore: vi.fn().mockImplementation(() => ({
      listMessages: vi.fn().mockResolvedValue([]),
    })),
    readOperationalMemoryState: vi.fn().mockResolvedValue({
      checkpointSummaryMessage: { operationalMemoryGeneration: 5 },
      metrics: {
        recentRawMessageCount: 12,
        recentRawTokenCount: 1500,
        overflowTokenCount: 200,
        observationTokenCount: 300,
        reflectionTokenCount: 150,
        checkpointTokenCount: 50,
      },
    }),
    toMastraSafeIdentifier: vi.fn((id: string) => id.replace(/-/g, '').slice(0, 32)),
    forgeDebug,
  };
});

vi.mock('../system-settings/store', () => ({
  createSystemSettingsStore: vi.fn().mockReturnValue({
    getSettings: vi.fn().mockResolvedValue({
      checkpointedOmRecentRawTokens: 2000,
      checkpointedOmRawObservationBatchTokens: 3000,
      checkpointedOmObservationTriggerTokenLimit: 4000,
      checkpointedOmReflectionTriggerTokenLimit: 5000,
      checkpointedOmTotalContextTokens: 100000,
      checkpointedOmObservationReflectionBatchTokens: 1000,
    }),
  }),
}));

vi.mock('./migrate-legacy-checkpointed-om', () => ({
  migrateLegacyCheckpointedOmState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./agent-home-metrics-preview-helpers', () => ({
  extractLatestMessagePreview: vi.fn().mockReturnValue('test preview'),
  extractLatestMessageToolBadge: vi.fn().mockReturnValue({ icon: '✉️', label: 'Mensagem' }),
}));

vi.mock('./agent-home-metrics-tool-helpers', () => ({
  mergeToolLogMessages: vi.fn((msgs: unknown[]) => msgs),
  buildThreadToolInvocationParts: vi.fn().mockReturnValue([]),
}));

// ---------------------------------------------------------------------------
// Tests — pure function (no mocks needed)
// ---------------------------------------------------------------------------

describe('buildAverageStepIntervalMs', () => {
  it('returns null for empty array', () => {
    expect(buildAverageStepIntervalMs([])).toBeNull();
  });

  it('returns null for single step', () => {
    expect(buildAverageStepIntervalMs([{ createdAt: 1700000000000 }])).toBeNull();
  });

  it('computes average interval between consecutive steps', () => {
    // t=100, t=60, t=30 → intervals: 40, 30 → avg: 35
    expect(buildAverageStepIntervalMs([
      { createdAt: 100 },
      { createdAt: 60 },
      { createdAt: 30 },
    ])).toBe(35);
  });

  it('caps negative deltas at 0', () => {
    expect(buildAverageStepIntervalMs([
      { createdAt: 100 },
      { createdAt: 200 },
      { createdAt: 300 },
    ])).toBe(0);
  });

  it('only considers first 6 steps', () => {
    const steps = Array.from({ length: 10 }, (_, i) => ({ createdAt: 1000 - i * 10 }));
    expect(buildAverageStepIntervalMs(steps)).toBe(10);
  });

  it('handles exactly 2 steps', () => {
    expect(buildAverageStepIntervalMs([{ createdAt: 200 }, { createdAt: 100 }])).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Tests — readLatestThreadDetails
// ---------------------------------------------------------------------------

describe('readLatestThreadDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns nulls and logs via forgeDebug when conversation store throws', async () => {
    const { LibsqlConversationStore, forgeDebug } = await import('@forge-runtime/core');
    vi.mocked(LibsqlConversationStore).mockImplementation(function MockStore() {
      return { listMessages: vi.fn().mockRejectedValue(new Error('DB read failed')) };
    });

    const result = await readLatestThreadDetails('/workspace', 'agent-err');

    expect(result.preview).toBeNull();
    expect(result.toolBadge).toBeNull();
    expect(vi.mocked(forgeDebug)).toHaveBeenCalled();
  });

  it('returns nulls when no assistant message is found in the conversation', async () => {
    const { LibsqlConversationStore } = await import('@forge-runtime/core');
    vi.mocked(LibsqlConversationStore).mockImplementation(function MockStore() {
      return { listMessages: vi.fn().mockResolvedValue([{ id: '1', role: 'user', parts: [] }]) };
    });

    const result = await readLatestThreadDetails('/workspace', 'agent-no-asst');

    expect(result.preview).toBeNull();
    expect(result.toolBadge).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests — readAgentRuntimeMemory
// Note: createClient is imported directly from `@libsql/client` (not via
// @forge-runtime/core), so it cannot be mocked via vi.mock. The only
// testable path without a real database is when the agent is not found —
// we verify that null is returned.
// ---------------------------------------------------------------------------

describe('readAgentRuntimeMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeMockDb(agent: unknown) {
    return {
      query: {
        agents: {
          findFirst: vi.fn().mockResolvedValue(agent),
        },
      },
    } as unknown as Parameters<typeof readAgentRuntimeMemory>[0];
  }

  it('returns null when agent not found in DB', async () => {
    const result = await readAgentRuntimeMemory(makeMockDb(null), '/workspace', 'nonexistent');
    expect(result).toBeNull();
  });
});