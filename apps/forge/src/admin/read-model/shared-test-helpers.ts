import { vi } from 'vitest';

/**
 * Creates a minimal mock DB object matching what the read-model factories expect.
 * This is the canonical mock DB factory shared across admin read-model test files.
 */
export function createMockDb(overrides = {}) {
  const db = {
    query: {
      agents: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      agentNotifications: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      agentExecutionContracts: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      agentRoles: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      llmProfiles: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      agentExecutionSteps: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      agentMcpConfigs: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      agentSchedules: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      mcpServerConfigs: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      agentHomeMetricSnapshots: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    }),
    ...overrides,
  };
  const MockDb = {
  query: {
    agents: ReturnType<typeof vi.fn>,
    agentNotifications: ReturnType<typeof vi.fn>,
    agentExecutionContracts: ReturnType<typeof vi.fn>,
    agentRoles: ReturnType<typeof vi.fn>,
    llmProfiles: ReturnType<typeof vi.fn>,
    agentExecutionSteps: ReturnType<typeof vi.fn>,
    agentMcpConfigs: ReturnType<typeof vi.fn>,
    agentSchedules: ReturnType<typeof vi.fn>,
    mcpServerConfigs: ReturnType<typeof vi.fn>,
    agentHomeMetricSnapshots: ReturnType<typeof vi.fn>,
  },
  select: ReturnType<typeof vi.fn>,
};
return db as typeof db & Record<string, unknown>;
}

/**
 * Resets shared agent read-model mocks that need per-test reset behaviour.
 * Call in `beforeEach` of any test file that uses the shared agents test setup.
 *
 * The following hoisted mock refs must be in scope where this is called:
 *   mockReadOperationalMemoryState, mockListThreadMessages,
 *   mockReadLongTermMemoryState
 */
export function resetAgentReadModelMocks(sharedMocks: {
  mockReadOperationalMemoryState: ReturnType<typeof vi.fn>;
  mockListThreadMessages: ReturnType<typeof vi.fn>;
  mockReadLongTermMemoryState: ReturnType<typeof vi.fn>;
}) {
  sharedMocks.mockReadOperationalMemoryState.mockReset();
  sharedMocks.mockReadOperationalMemoryState.mockResolvedValue(null);
  sharedMocks.mockListThreadMessages.mockReset();
  sharedMocks.mockListThreadMessages.mockResolvedValue({ items: [], hasMore: false });
  sharedMocks.mockReadLongTermMemoryState.mockReset();
  sharedMocks.mockReadLongTermMemoryState.mockResolvedValue(null);
}
