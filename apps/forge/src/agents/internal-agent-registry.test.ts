import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock @forge-runtime/core before anything else
vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

// Track runner instances so we can spy on them
const mockRunnerInstances = new Map<string, ReturnType<typeof vi.fn>>();

vi.mock('./agent-runner', () => ({
  createAgentRunner: vi.fn((_db, runtime) => {
    const runner = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      notifyExternalEvent: vi.fn(),
      getSnapshot: vi.fn().mockReturnValue({ wake: { events: [] }, pendingRunEvents: [] }),
    };
    mockRunnerInstances.set(runtime.id, runner);
    return runner;
  }),
}));

vi.mock('./agent-loader', () => ({
  loadAgents: vi.fn(),
  loadAgent: vi.fn(),
}));

// Import the factory function — not the shared singleton directly
import { getInternalAgentRegistry } from './internal-agent-registry';
import type { InternalAgentRuntime } from './runtime/types';
import type { Database } from '../database/index';

function makeRuntime(id = 'agent-test-1', name = 'Test Agent'): InternalAgentRuntime {
  return {
    id,
    name,
    dispose: vi.fn().mockResolvedValue(undefined),
  } as unknown as InternalAgentRuntime;
}

function makeDb() {
  return {} as unknown as Database;
}

function makeConfig() {
  return {
    workspaceBasePath: '/workspaces/forge',
    listTools: vi.fn(),
    resolveSkillRoot: vi.fn(),
  };
}

function registry() {
  return getInternalAgentRegistry();
}

describe('internal-agent-registry', () => {
  beforeEach(() => {
    // Clear registry state between tests
    for (const entry of registry().list()) {
      registry().remove(entry.runtime.id);
    }
    mockRunnerInstances.clear();
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('returns empty array initially', () => {
      expect(registry().list()).toHaveLength(0);
    });
  });

  describe('get', () => {
    it('returns null for unknown agent id', () => {
      expect(registry().get('nonexistent')).toBeNull();
    });
  });

  describe('add', () => {
    it('registers runtime and returns entry', async () => {
      const runtime = makeRuntime('new-agent', 'New Agent');
      const entry = await registry().add(makeDb(), runtime);

      expect(entry.runtime.id).toBe('new-agent');
      expect(entry.runner).toBeDefined();
    });

    it('calls start on the runner', async () => {
      const runtime = makeRuntime('start-agent');
      await registry().add(makeDb(), runtime);

      const runner = mockRunnerInstances.get('start-agent');
      expect(runner!.start).toHaveBeenCalled();
    });

    it('get returns the registered entry', async () => {
      const runtime = makeRuntime('get-agent');
      await registry().add(makeDb(), runtime);

      const entry = registry().get('get-agent');
      expect(entry).not.toBeNull();
      expect(entry!.runtime.id).toBe('get-agent');
    });

    it('calling add twice with same id replaces old entry', async () => {
      const runtime1 = makeRuntime('dup-id', 'First');
      await registry().add(makeDb(), runtime1);

      const stopSpy = vi.spyOn(mockRunnerInstances.get('dup-id')!, 'stop');

      const runtime2 = makeRuntime('dup-id', 'Second');
      await registry().add(makeDb(), runtime2);

      expect(stopSpy).toHaveBeenCalled();
      expect(registry().get('dup-id')!.runtime.name).toBe('Second');
    });

    it('does nothing when removing unknown agent', () => {
      expect(() => registry().remove('unknown-agent')).not.toThrow();
    });

    it('can remove a registered agent', async () => {
      const runtime = makeRuntime('remove-agent');
      await registry().add(makeDb(), runtime);
      registry().remove('remove-agent');
      expect(registry().get('remove-agent')).toBeNull();
    });

    it('lists all registered agents', async () => {
      await registry().add(makeDb(), makeRuntime('list-1'));
      await registry().add(makeDb(), makeRuntime('list-2'));

      const entries = registry().list();
      expect(entries).toHaveLength(2);
      const ids = entries.map((e) => e.runtime.id).sort();
      expect(ids).toEqual(['list-1', 'list-2']);
    });
  });

  describe('loadAll', () => {
    it('loads agents and returns the list', async () => {
      const { loadAgents } = await import('./agent-loader');
      vi.mocked(loadAgents).mockResolvedValue(new Map());

      const result = await registry().loadAll(makeDb(), makeConfig());
      expect(result).toHaveLength(0);
      expect(loadAgents).toHaveBeenCalled();
    });

    it('loadAll twice clears stale agents from first call', async () => {
      const { loadAgents } = await import('./agent-loader');
      const runtimes = new Map<string, InternalAgentRuntime>();
      runtimes.set('reload-agent', makeRuntime('reload-agent'));
      vi.mocked(loadAgents).mockResolvedValue(runtimes);

      await registry().loadAll(makeDb(), makeConfig());
      expect(registry().list()).toHaveLength(1);

      // Second call with empty map removes all
      vi.mocked(loadAgents).mockResolvedValue(new Map());
      await registry().loadAll(makeDb(), makeConfig());
      expect(registry().list()).toHaveLength(0);
    });
  });
});
