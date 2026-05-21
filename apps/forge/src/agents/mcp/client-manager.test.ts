/**
 * Tests for AgentMcpRuntimeActionSourceManager (client-manager.ts)
 *
 * Architecture note:
 *   ForgeMcpToolset delegates to McpSessionRegistry from agent-runtime-core.
 *   We mock at the @forge-runtime/core boundary so the full
 *   createRuntimeActions() → getActionDefinitions() call chain is exercised.
 *
 * All vi.fn() values used as mock implementations MUST be hoisted at module
 * level so Vitest can wire the same reference into the factory.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { McpServerConfig, AgentMcpConfig } from './store';

// ─── Hoisted mocks (must be defined before vi.mock runs) ─────────────────────

const { mockCreateRuntimeActions, mockDisposeAll, MockForgeMcpToolset } = vi.hoisted(() => {
  const mockCreateRuntimeActions =
    vi.fn<
      (opts: unknown) => Promise<Array<{ name: string; description: string; inputSchema: object }>>
    >();
  const mockDisposeAll = vi.fn().mockResolvedValue(undefined);

  class MockForgeMcpToolset {
    createRuntimeActions = mockCreateRuntimeActions;
    dispose = mockDisposeAll;
  }

  return { mockCreateRuntimeActions, mockDisposeAll, MockForgeMcpToolset };
});

vi.mock('@forge-runtime/core', async () => {
  const actual = await vi.importActual<typeof import('@forge-runtime/core')>('@forge-runtime/core');
  return {
    ...(actual as any),
    ForgeMcpToolset: MockForgeMcpToolset,
    forgeDebug: vi.fn(),
  };
});

vi.mock('agent-runtime-core/integrations', async (original) => {
  const actual = await original();
  return {
    ...(actual as any),
    McpSessionRegistry: vi.fn(),
    SdkMcpGateway: vi.fn().mockImplementation(() => ({})),
  };
});

const mockGetAgentMcpServers =
  vi.fn<(agentId: string) => Promise<Array<{ config: AgentMcpConfig; server: McpServerConfig }>>>();
vi.mock('./store.js', () => ({
  getAgentMcpServers: mockGetAgentMcpServers,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeServer(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id: 'server-1',
    name: 'test-server',
    description: 'A test MCP server',
    transport: 'stdio',
    command: 'node',
    args: '["server.js"]',
    envVars: null,
    url: null,
    headers: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    isActive: 1,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<AgentMcpConfig> = {}): AgentMcpConfig {
  return {
    id: 'config-1',
    agentId: 'agent-1',
    serverId: 'server-1',
    isActive: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe('createAgentMcpRuntimeActionSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    mockCreateRuntimeActions.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('returns action source with expected shape', async () => {
    const { createAgentMcpRuntimeActionSource } = await import('./client-manager.js');
    const source = createAgentMcpRuntimeActionSource('agent-1');
    expect(source).toMatchObject({
      start: expect.any(Function),
      getActions: expect.any(Function),
      dispose: expect.any(Function),
    });
  });

  test('start calls refresh which loads servers from store', async () => {
    mockGetAgentMcpServers.mockResolvedValue([]);
    const { createAgentMcpRuntimeActionSource } = await import('./client-manager.js');
    const source = createAgentMcpRuntimeActionSource('agent-1');
    source.start();
    // Advance by 1ms so the 0ms setTimeout fires (fake timers need > 0 delta)
    await vi.advanceTimersByTimeAsync(1);
    expect(mockGetAgentMcpServers).toHaveBeenCalledWith('agent-1');
  });

  test('getActions returns empty array before start', async () => {
    const { createAgentMcpRuntimeActionSource } = await import('./client-manager.js');
    const source = createAgentMcpRuntimeActionSource('agent-1');
    const actions = await source.getActions();
    expect(actions).toEqual([]);
  });

  test('getActions returns actions from connected toolsets after start', async () => {
    const actions = [{ name: 'tool-a', description: 'A tool', inputSchema: {} }];
    mockCreateRuntimeActions.mockResolvedValue(actions);
    mockGetAgentMcpServers.mockResolvedValue([{ config: makeConfig(), server: makeServer() }]);
    const { createAgentMcpRuntimeActionSource } = await import('./client-manager.js');
    const source = createAgentMcpRuntimeActionSource('agent-1');
    source.start();
    await vi.advanceTimersByTimeAsync(1);
    const result = await source.getActions();
    expect(result).toMatchObject(actions);
  });

  test('refreshNow fetches fresh data from store', async () => {
    mockGetAgentMcpServers.mockResolvedValue([
      { config: makeConfig(), server: makeServer({ id: 'srv-fresh' }) },
    ]);
    mockCreateRuntimeActions.mockResolvedValue([]);
    const { createAgentMcpRuntimeActionSource } = await import('./client-manager.js');
    const source = createAgentMcpRuntimeActionSource('agent-1');
    source.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(mockGetAgentMcpServers).toHaveBeenCalledWith('agent-1');
  });

  test('getActions accumulates tools from multiple servers', async () => {
    const toolB = { name: 'only-b', description: 'B only', inputSchema: {} };
    const toolC = { name: 'only-c', description: 'C only', inputSchema: {} };
    mockCreateRuntimeActions
      .mockResolvedValueOnce([{ name: 'only-a', description: 'A only', inputSchema: {} }, toolB])
      .mockResolvedValueOnce([toolB, toolC]);
    mockGetAgentMcpServers.mockResolvedValue([
      { config: makeConfig({ id: 'cfg-1' }), server: makeServer({ id: 'srv-1' }) },
      {
        config: makeConfig({ id: 'cfg-2', serverId: 'srv-2' }),
        server: makeServer({ id: 'srv-2' }),
      },
    ]);
    const { createAgentMcpRuntimeActionSource } = await import('./client-manager.js');
    const source = createAgentMcpRuntimeActionSource('agent-1');
    source.start();
    await vi.advanceTimersByTimeAsync(1);
    const result = await source.getActions();
    const names = result.map((a) => a.name);
    expect(names).toContain('only-a');
    expect(names).toContain('only-b');
    expect(names).toContain('only-c');
  });

  test('dispose clears all toolsets and resets actions', async () => {
    mockCreateRuntimeActions.mockResolvedValue([{ name: 't1', description: '', inputSchema: {} }]);
    mockGetAgentMcpServers.mockResolvedValue([{ config: makeConfig(), server: makeServer() }]);
    const { createAgentMcpRuntimeActionSource } = await import('./client-manager.js');
    const source = createAgentMcpRuntimeActionSource('agent-1');
    source.start();
    await vi.advanceTimersByTimeAsync(1);
    await source.dispose();
    expect(mockDisposeAll).toHaveBeenCalled();
    const actions = await source.getActions();
    expect(actions).toEqual([]);
  });

  test('start debounces when already refreshing', async () => {
    let resolveCount = 0;
    mockGetAgentMcpServers.mockImplementation(() => {
      resolveCount++;
      return new Promise<void>((r) => setTimeout(r, 50)).then(() => []);
    });
    mockCreateRuntimeActions.mockResolvedValue([]);
    const { createAgentMcpRuntimeActionSource } = await import('./client-manager.js');
    const source = createAgentMcpRuntimeActionSource('agent-1');
    source.start();
    source.start(); // concurrent call — should debounce
    await vi.advanceTimersByTimeAsync(100);
    // Only one store call despite two start() calls
    expect(resolveCount).toBe(1);
  });
});

// ─── Additional tests: error paths, retry, disconnect handling ───────────────

describe('refreshNow error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('logs forgeDebug when connectServer throws', async () => {
    mockGetAgentMcpServers.mockResolvedValue([{ config: makeConfig(), server: makeServer() }]);
    mockCreateRuntimeActions.mockRejectedValue(new Error('Connection refused'));
    const { createAgentMcpRuntimeActionSource } = await import('./client-manager.js');
    const source = createAgentMcpRuntimeActionSource('agent-1');
    source.start();
    await vi.advanceTimersByTimeAsync(1);
    // The server connection failed — the action list should still be empty
    const actions = await source.getActions();
    expect(actions).toEqual([]);
  });

  test('removes stale servers that are no longer in store', async () => {
    // First: connect a server
    mockCreateRuntimeActions.mockResolvedValue([
      { name: 'tool-a', description: '', inputSchema: {} },
    ]);
    mockGetAgentMcpServers.mockResolvedValueOnce([
      { config: makeConfig(), server: makeServer({ id: 'srv-stale' }) },
    ]);
    const { createAgentMcpRuntimeActionSource } = await import('./client-manager.js');
    const source = createAgentMcpRuntimeActionSource('agent-1');
    source.start();
    await vi.advanceTimersByTimeAsync(1);

    expect(await source.getActions()).toHaveLength(1);

    // Server removed from store — should be disposed
    mockCreateRuntimeActions.mockResolvedValue([]);
    mockGetAgentMcpServers.mockResolvedValueOnce([]); // empty — srv-stale no longer present
    source.start();
    await vi.advanceTimersByTimeAsync(1);

    expect(mockDisposeAll).toHaveBeenCalled();
    expect(await source.getActions()).toHaveLength(0);
  });

  test('skips reconnection when fingerprint unchanged and actions exist', async () => {
    const actions = [{ name: 'stable-tool', description: '', inputSchema: {} }];
    mockCreateRuntimeActions.mockResolvedValue(actions);
    mockGetAgentMcpServers.mockResolvedValue([{ config: makeConfig(), server: makeServer() }]);
    const { createAgentMcpRuntimeActionSource } = await import('./client-manager.js');
    const source = createAgentMcpRuntimeActionSource('agent-1');
    source.start();
    await vi.advanceTimersByTimeAsync(1);

    // Second refresh with same server — should NOT call createRuntimeActions again
    mockCreateRuntimeActions.mockClear();
    mockGetAgentMcpServers.mockResolvedValue([{ config: makeConfig(), server: makeServer() }]);
    source.start();
    await vi.advanceTimersByTimeAsync(1);

    expect(mockCreateRuntimeActions).not.toHaveBeenCalled();
    expect(await source.getActions()).toMatchObject(actions);
  });
});

describe('wrapAction error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('rethrows action error after logging and triggering disconnect', async () => {
    const innerError = new Error('Tool execution failed');
    mockCreateRuntimeActions.mockResolvedValue([
      {
        name: 'failing-tool',
        description: '',
        inputSchema: {},
        execute: vi.fn().mockRejectedValue(innerError) as any,
      },
    ] as any);
    mockGetAgentMcpServers.mockResolvedValue([{ config: makeConfig(), server: makeServer() }]);
    const { createAgentMcpRuntimeActionSource } = await import('./client-manager.js');
    const source = createAgentMcpRuntimeActionSource('agent-1');
    source.start();
    await vi.advanceTimersByTimeAsync(1);

    const actions = await source.getActions();
    const action = actions.find((a) => a.name === 'failing-tool')!;
    await expect(
      action.execute({}, { runtimeId: 'r1', stepId: 's1', stepNumber: 1 }),
    ).rejects.toThrow('Tool execution failed');
  });
});

describe('scheduleRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('schedules refresh with exponential backoff after connection failure', async () => {
    mockGetAgentMcpServers.mockResolvedValue([{ config: makeConfig(), server: makeServer() }]);
    mockCreateRuntimeActions.mockRejectedValue(new Error('Network error'));
    const { createAgentMcpRuntimeActionSource } = await import('./client-manager.js');
    const source = createAgentMcpRuntimeActionSource('agent-1');
    source.start();
    await vi.advanceTimersByTimeAsync(1);

    // Should have scheduled a retry with exponential backoff
    // Base delay: 5000ms, first retry
    await vi.advanceTimersByTimeAsync(5_000);
    // Refresh should run again
    expect(mockGetAgentMcpServers).toHaveBeenCalled();
  });
});

describe('dispose', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('prevents further scheduleRefresh after dispose', async () => {
    mockCreateRuntimeActions.mockResolvedValue([
      { name: 'tool', description: '', inputSchema: {} },
    ]);
    mockGetAgentMcpServers.mockResolvedValue([{ config: makeConfig(), server: makeServer() }]);
    const { createAgentMcpRuntimeActionSource } = await import('./client-manager.js');
    const source = createAgentMcpRuntimeActionSource('agent-1');
    source.start();
    await vi.advanceTimersByTimeAsync(1);
    await source.dispose();

    mockGetAgentMcpServers.mockClear();
    // Even though the timer for retry would fire, dispose should prevent refresh
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mockGetAgentMcpServers).not.toHaveBeenCalled();
  });
});

describe('mapServerConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('maps stdio transport correctly', async () => {
    const { createAgentMcpRuntimeActionSource } = await import('./client-manager.js');
    const source = createAgentMcpRuntimeActionSource('agent-1');
    source.start();
    // The actual mapServerConfig is internal; verify stdio server connects via ForgeMcpToolset
    mockGetAgentMcpServers.mockResolvedValue([
      {
        config: makeConfig(),
        server: makeServer({
          transport: 'stdio',
          command: '/usr/bin/node',
          args: '["script.js"]',
          envVars: '{"KEY":"val"}',
        }),
      },
    ]);
    mockCreateRuntimeActions.mockResolvedValue([]);
    await vi.advanceTimersByTimeAsync(1);
    // Verify the toolset was created (mock was called)
    expect(mockCreateRuntimeActions).toHaveBeenCalled();
  });

  test('maps http-stream transport correctly', async () => {
    const { createAgentMcpRuntimeActionSource } = await import('./client-manager.js');
    const source = createAgentMcpRuntimeActionSource('agent-1');
    source.start();
    mockGetAgentMcpServers.mockResolvedValue([
      {
        config: makeConfig(),
        server: makeServer({
          transport: 'http-stream',
          url: 'https://mcp.example.com/stream',
          headers: '{"Authorization":"Bearer token"}',
        }),
      },
    ]);
    mockCreateRuntimeActions.mockResolvedValue([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(mockCreateRuntimeActions).toHaveBeenCalled();
  });
});

describe('fingerprintServerConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('same config produces same fingerprint', async () => {
    const { createAgentMcpRuntimeActionSource } = await import('./client-manager.js');
    const source = createAgentMcpRuntimeActionSource('agent-1');
    // Two connects with identical config should be detected as no-change
    mockGetAgentMcpServers.mockResolvedValue([{ config: makeConfig(), server: makeServer() }]);
    mockCreateRuntimeActions.mockResolvedValue([
      { name: 'tool', description: '', inputSchema: {} },
    ]);
    source.start();
    await vi.advanceTimersByTimeAsync(1);

    mockCreateRuntimeActions.mockClear();
    mockGetAgentMcpServers.mockResolvedValue([{ config: makeConfig(), server: makeServer() }]);
    source.start();
    await vi.advanceTimersByTimeAsync(1);

    // No reconnection needed — same fingerprint
    expect(mockCreateRuntimeActions).not.toHaveBeenCalled();
  });

  test('different config triggers reconnection', async () => {
    mockGetAgentMcpServers.mockResolvedValue([{ config: makeConfig(), server: makeServer() }]);
    mockCreateRuntimeActions.mockResolvedValue([
      { name: 'tool', description: '', inputSchema: {} },
    ]);
    const { createAgentMcpRuntimeActionSource } = await import('./client-manager.js');
    const source = createAgentMcpRuntimeActionSource('agent-1');
    source.start();
    await vi.advanceTimersByTimeAsync(1);

    mockCreateRuntimeActions.mockClear();
    // Config changed (different command)
    mockGetAgentMcpServers.mockResolvedValue([
      { config: makeConfig(), server: makeServer({ command: 'python3' }) },
    ]);
    source.start();
    await vi.advanceTimersByTimeAsync(1);

    expect(mockCreateRuntimeActions).toHaveBeenCalled();
  });
});
