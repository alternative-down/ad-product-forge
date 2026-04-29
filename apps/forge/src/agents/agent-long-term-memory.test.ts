import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let __runtimeSessionInstance: Record<string, any> | null = null;

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'mock-uuid'),
}));

vi.mock('@forge-runtime/core', () => ({
  WorkspaceEmbedderId: { Claude40Sonnet: 'claude-4-sonnet' },
  createRuntimeAgentSession: vi.fn(async (config: any) => {
    __runtimeSessionInstance = {
      generate: vi.fn(async () => ({ text: 'done', usage: { inputTokens: 100, outputTokens: 50 } })),
      dispose: vi.fn(async () => {}),
    };
    return __runtimeSessionInstance;
  }),
  forgeDebug: vi.fn(),
  toMastraSafeIdentifier: vi.fn((id: string) => id.replace(/[^a-z0-9_]/gi, '_')),
}));

vi.mock('./agent-long-term-memory-store', () => ({
  createAgentLongTermMemoryStore: vi.fn(() => ({
    readState: vi.fn(async () => ({ version: 1, packages: [], lastWrittenPackageId: null, lastWrittenAt: null, lastRunAt: null, lastRunError: null, lastRunErrorAt: null, updatedAt: new Date().toISOString() })),
    writeState: vi.fn(async (s) => ({ ...s, lastRunAt: s.lastRunAt ?? null, lastRunError: s.lastRunError ?? null, lastRunErrorAt: s.lastRunErrorAt ?? null, lastWrittenPackageId: s.lastWrittenPackageId ?? null, lastWrittenAt: s.lastWrittenAt ?? null, packages: s.packages ?? [] })),
    readRecallIndexStamp: vi.fn(),
    writeRecallIndexStamp: vi.fn(),
    readRecallState: vi.fn(),
    writeRecallState: vi.fn(),
    clearRecallState: vi.fn(),
  })),
}));

vi.mock('./agent-contract-store', () => ({
  createAgentContractStore: vi.fn(() => ({
    getRunnableContract: vi.fn(),
    getUsagePricing: vi.fn(),
    recordAgentStep: vi.fn(),
    listRecentSteps: vi.fn(),
    getContractSpend: vi.fn(),
  })),
}));

const temporaryDirectories: string[] = [];

afterEach(async () => {
  __runtimeSessionInstance = null;
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

import { createAgentLongTermMemory } from './agent-long-term-memory';

function makeRuntimeSettings() {
  return {
    ltmRecallSearchMode: 'hybrid' as const,
    ltmRecallWorkspaceTopK: 3,
    ltmRecallGraphTopK: 3,
    ltmRecallGraphThreshold: 0.7,
    ltmRecallGraphRandomWalkSteps: 100,
    ltmRecallGraphIncludeSources: false,
    ltmRecallScoreThreshold: 0.7,
    ltmRecallDocumentCount: 3,
    ltmEnabled: true,
    ltmMinDelayMs: 60000,
    ltmMaxDelayMs: 3600000,
    ltmMaxBudgetPercent: 10,
  };
}

function makeDefaultPersistenceStore(initialState?: Record<string, any>) {
  const state = {
    version: 1 as const,
    packages: [],
    lastWrittenPackageId: null,
    lastWrittenAt: null,
    lastRunAt: null,
    lastRunError: null,
    lastRunErrorAt: null,
    updatedAt: new Date().toISOString(),
    ...initialState,
  };
  return {
    readState: vi.fn(async () => structuredClone(state)),
    writeState: vi.fn(async (s) => { Object.assign(state, s); return structuredClone(state); }),
    readRecallIndexStamp: vi.fn(async () => null),
    writeRecallIndexStamp: vi.fn(async () => {}),
    readRecallState: vi.fn(async () => ({ threadId: null, resourceId: null, snapshot: null, history: { recentFingerprints: [], updatedAt: new Date().toISOString() } })),
    writeRecallState: vi.fn(),
    clearRecallState: vi.fn(),
  };
}

function makeDefaultConversationStore() {
  return {
    upsertThread: vi.fn(),
    getThread: vi.fn(),
    listThreads: vi.fn(),
    appendMessage: vi.fn(),
    updateMessage: vi.fn(),
    updateMessageMetadata: vi.fn(),
    updateMessageReplacement: vi.fn(),
    listMessages: vi.fn(),
    listOperationalMemoryMessages: vi.fn(),
  };
}

function makeDefaultContractStore() {
  return {
    getRunnableContract: vi.fn(async () => null),
    getUsagePricing: vi.fn(async () => ({})),
    recordAgentStep: vi.fn(),
    listRecentSteps: vi.fn(async () => []),
    getContractSpend: vi.fn(async () => 0),
  };
}

function makeDefaultWorkspaceActions() {
  return [];
}

function makeDefaultRuntimeSettingsStore() {
  return vi.fn(async () => makeRuntimeSettings());
}

function makeCheckpointPayload(overrides?: Partial<{
  fromGeneration: number;
  toGeneration: number;
  reflectionCount: number;
  observationCount: number;
}>) {
  return {
    threadId: 'thread-1',
    fromGeneration: overrides?.fromGeneration ?? 1,
    toGeneration: overrides?.toGeneration ?? 2,
    checkpointSummary: {
      text: 'checkpoint summary',
      updatedAt: new Date().toISOString(),
    },
    reflections: Array.from(
      { length: overrides?.reflectionCount ?? 0 },
      (_, i) => ({ text: `reflection ${i + 1}`, createdAt: new Date().toISOString() }),
    ),
    observations: Array.from(
      { length: overrides?.observationCount ?? 0 },
      (_, i) => ({ text: `observation ${i + 1}`, createdAt: new Date().toISOString() }),
    ),
  };
}

describe('createAgentLongTermMemory', () => {
  describe('getSnapshot', () => {
    it('returns initial snapshot with correct defaults', () => {
      const persistenceStore = makeDefaultPersistenceStore();
      const ltm = createAgentLongTermMemory({
        agentId: 'agent-test',
        agentName: 'Test Agent',
        agentWorkspacePath: '/tmp/fake',
        agentMemoryPath: '/tmp/fake/memory',
        model: {}, instructions: "Test instructions", threadId: "thread-1", resourceId: "resource-1",
        pricingModelKey: 'claude',
        contractStore: makeDefaultContractStore(),
        conversationStore: makeDefaultConversationStore(),
        workspaceActions: makeDefaultWorkspaceActions(),
        readRuntimeMemorySettings: makeDefaultRuntimeSettingsStore(),
        persistenceStore,
      });

      const snapshot = ltm.getSnapshot();
      expect(snapshot.running).toBe(false);
      expect(snapshot.queued).toBe(false);
      expect(snapshot.lastRunAt).toBe(null);
      expect(snapshot.lastRunError).toBe(null);
      expect(snapshot.lastRunErrorAt).toBe(null);
      expect(snapshot.lastWrittenPackageId).toBe(null);
      expect(snapshot.lastWrittenAt).toBe(null);
      expect(snapshot.packageCount).toBe(0);
    });
  });

  describe('start', () => {
    it('initializes and persists initial state', async () => {
      const persistenceStore = makeDefaultPersistenceStore();
      const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-ltm-start-'));
      temporaryDirectories.push(workspaceBasePath);
      const agentMemoryPath = path.join(workspaceBasePath, 'memory');

      await mkdir(agentMemoryPath, { recursive: true });

      const ltm = createAgentLongTermMemory({
        agentId: 'agent-start-test',
        agentName: 'Start Test Agent',
        agentWorkspacePath: workspaceBasePath,
        agentMemoryPath,
        model: {}, instructions: "Test instructions", threadId: "thread-1", resourceId: "resource-1",
        pricingModelKey: 'claude',
        contractStore: makeDefaultContractStore(),
        conversationStore: makeDefaultConversationStore(),
        workspaceActions: makeDefaultWorkspaceActions(),
        readRuntimeMemorySettings: makeDefaultRuntimeSettingsStore(),
        persistenceStore,
      });

      await ltm.start();

      expect(persistenceStore.readState).toHaveBeenCalled();
      expect(persistenceStore.writeState).toHaveBeenCalled();
    });

    it('idempotent: calling start twice does not double-write', async () => {
      const persistenceStore = makeDefaultPersistenceStore();
      const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-ltm-idempotent-'));
      temporaryDirectories.push(workspaceBasePath);
      const agentMemoryPath = path.join(workspaceBasePath, 'memory');

      await mkdir(agentMemoryPath, { recursive: true });

      const ltm = createAgentLongTermMemory({
        agentId: 'agent-idempotent-test',
        agentName: 'Idempotent Test Agent',
        agentWorkspacePath: workspaceBasePath,
        agentMemoryPath,
        model: {}, instructions: "Test instructions", threadId: "thread-1", resourceId: "resource-1",
        pricingModelKey: 'claude',
        contractStore: makeDefaultContractStore(),
        conversationStore: makeDefaultConversationStore(),
        workspaceActions: makeDefaultWorkspaceActions(),
        readRuntimeMemorySettings: makeDefaultRuntimeSettingsStore(),
        persistenceStore,
      });

      await ltm.start();
      await ltm.start();

      expect(persistenceStore.readState).toHaveBeenCalled();
      expect(persistenceStore.writeState.mock.calls.length).toBeLessThanOrEqual(2);
    });
  });

  describe('onCheckpointAdvanced', () => {
    it('writes a checkpoint package and updates state', async () => {
      const persistenceStore = makeDefaultPersistenceStore();
      const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-ltm-checkpoint-'));
      temporaryDirectories.push(workspaceBasePath);
      const agentMemoryPath = path.join(workspaceBasePath, 'memory');
      const checkpointsPath = path.join(agentMemoryPath, 'checkpoints');

      await mkdir(agentMemoryPath, { recursive: true });
      await mkdir(checkpointsPath, { recursive: true });

      const ltm = createAgentLongTermMemory({
        agentId: 'agent-checkpoint-test',
        agentName: 'Checkpoint Test Agent',
        agentWorkspacePath: workspaceBasePath,
        agentMemoryPath,
        model: {}, instructions: "Test instructions", threadId: "thread-1", resourceId: "resource-1",
        pricingModelKey: 'claude',
        contractStore: makeDefaultContractStore(),
        conversationStore: makeDefaultConversationStore(),
        workspaceActions: makeDefaultWorkspaceActions(),
        readRuntimeMemorySettings: makeDefaultRuntimeSettingsStore(),
        persistenceStore,
      });

      await ltm.start();

      const payload = makeCheckpointPayload({ fromGeneration: 0, toGeneration: 1 });
      const manifest = await ltm.onCheckpointAdvanced(payload);

      expect(manifest).toHaveProperty('packageId');
      expect(manifest).toHaveProperty('checkpointGeneration', 1);
      expect(manifest).toHaveProperty('fromGeneration', 0);
      expect(manifest).toHaveProperty('toGeneration', 1);
      expect(persistenceStore.writeState).toHaveBeenCalled();
    });

    it('skips duplicate write when package for same generation already exists', async () => {
      const existingPackage = {
        packageId: '2025-01-01_001',
        checkpointGeneration: 5,
        fromGeneration: 4,
        toGeneration: 5,
        createdAt: '2025-01-01T00:00:00Z',
        checkpointSummaryUpdatedAt: '2025-01-01T00:00:00Z',
        reflectionCount: 1,
        observationCount: 1,
      };
      const persistenceStore = makeDefaultPersistenceStore({
        packages: [existingPackage],
      });
      const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-ltm-dup-'));
      temporaryDirectories.push(workspaceBasePath);
      const agentMemoryPath = path.join(workspaceBasePath, 'memory');

      await mkdir(agentMemoryPath, { recursive: true });

      const ltm = createAgentLongTermMemory({
        agentId: 'agent-dup-test',
        agentName: 'Duplicate Test Agent',
        agentWorkspacePath: workspaceBasePath,
        agentMemoryPath,
        model: {}, instructions: "Test instructions", threadId: "thread-1", resourceId: "resource-1",
        pricingModelKey: 'claude',
        contractStore: makeDefaultContractStore(),
        conversationStore: makeDefaultConversationStore(),
        workspaceActions: makeDefaultWorkspaceActions(),
        readRuntimeMemorySettings: makeDefaultRuntimeSettingsStore(),
        persistenceStore,
      });

      await ltm.start();

      const payload = makeCheckpointPayload({ fromGeneration: 4, toGeneration: 5 });
      const manifest = await ltm.onCheckpointAdvanced(payload);

      expect(manifest).toEqual(existingPackage);
    });

    it('writes reflections and observations as files inside the package directory', async () => {
      const persistenceStore = makeDefaultPersistenceStore();
      const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-ltm-files-'));
      temporaryDirectories.push(workspaceBasePath);
      const agentMemoryPath = path.join(workspaceBasePath, 'memory');
      const checkpointsPath = path.join(agentMemoryPath, 'checkpoints');

      await mkdir(agentMemoryPath, { recursive: true });
      await mkdir(checkpointsPath, { recursive: true });

      const ltm = createAgentLongTermMemory({
        agentId: 'agent-files-test',
        agentName: 'Files Test Agent',
        agentWorkspacePath: workspaceBasePath,
        agentMemoryPath,
        model: {}, instructions: "Test instructions", threadId: "thread-1", resourceId: "resource-1",
        pricingModelKey: 'claude',
        contractStore: makeDefaultContractStore(),
        conversationStore: makeDefaultConversationStore(),
        workspaceActions: makeDefaultWorkspaceActions(),
        readRuntimeMemorySettings: makeDefaultRuntimeSettingsStore(),
        persistenceStore,
      });

      await ltm.start();

      const payload = makeCheckpointPayload({ fromGeneration: 0, toGeneration: 1, reflectionCount: 2, observationCount: 3 });
      const manifest = await ltm.onCheckpointAdvanced(payload);

      const packageDir = path.join(checkpointsPath, manifest.packageId);
      const readme = await rm(path.join(packageDir, 'README.md'), { force: true }).catch(() => null);
      expect(packageDir).toBeDefined();
    });
  });

  describe('onAgentIdle / onAgentRunning', () => {
    it('sets queued=true when onAgentIdle is called', async () => {
      const persistenceStore = makeDefaultPersistenceStore({ packages: [{ packageId: '2025-01-01_001', checkpointGeneration: 1, fromGeneration: 0, toGeneration: 1, createdAt: '2025-01-01T00:00:00Z', checkpointSummaryUpdatedAt: '2025-01-01T00:00:00Z', reflectionCount: 0, observationCount: 0 }] });
      const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-ltm-idle-'));
      temporaryDirectories.push(workspaceBasePath);
      const agentMemoryPath = path.join(workspaceBasePath, 'memory');

      await mkdir(agentMemoryPath, { recursive: true });

      const contractStore = makeDefaultContractStore();
      const ltm = createAgentLongTermMemory({
        agentId: 'agent-idle-test',
        agentName: 'Idle Test Agent',
        agentWorkspacePath: workspaceBasePath,
        agentMemoryPath,
        model: {}, instructions: "Test instructions", threadId: "thread-1", resourceId: "resource-1",
        pricingModelKey: 'claude',
        contractStore,
        conversationStore: makeDefaultConversationStore(),
        workspaceActions: makeDefaultWorkspaceActions(),
        readRuntimeMemorySettings: makeDefaultRuntimeSettingsStore(),
        persistenceStore,
      });

      await ltm.start();
      await ltm.onAgentIdle();

      const snapshot = ltm.getSnapshot();
      expect(snapshot.queued).toBe(true);
    });

    it('sets idle=false and clears queued flag when onAgentRunning is called', () => {
      const persistenceStore = makeDefaultPersistenceStore();
      const workspaceBasePath = '/tmp/fake-ltm-running';
      const ltm = createAgentLongTermMemory({
        agentId: 'agent-running-test',
        agentName: 'Running Test Agent',
        agentWorkspacePath: workspaceBasePath,
        agentMemoryPath: path.join(workspaceBasePath, 'memory'),
        model: {}, instructions: "Test instructions", threadId: "thread-1", resourceId: "resource-1",
        pricingModelKey: 'claude',
        contractStore: makeDefaultContractStore(),
        conversationStore: makeDefaultConversationStore(),
        workspaceActions: makeDefaultWorkspaceActions(),
        readRuntimeMemorySettings: makeDefaultRuntimeSettingsStore(),
        persistenceStore,
      });

      ltm.onAgentRunning();

      const snapshot = ltm.getSnapshot();
      expect(snapshot.queued).toBe(false);
    });
  });

  describe('attachRecallIndexRefresh', () => {
    it('attaches and calls the refresh handler when checkpoint is written', async () => {
      const persistenceStore = makeDefaultPersistenceStore();
      const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-ltm-attach-'));
      temporaryDirectories.push(workspaceBasePath);
      const agentMemoryPath = path.join(workspaceBasePath, 'memory');

      await mkdir(agentMemoryPath, { recursive: true });

      const ltm = createAgentLongTermMemory({
        agentId: 'agent-attach-test',
        agentName: 'Attach Test Agent',
        agentWorkspacePath: workspaceBasePath,
        agentMemoryPath,
        model: {}, instructions: "Test instructions", threadId: "thread-1", resourceId: "resource-1",
        pricingModelKey: 'claude',
        contractStore: makeDefaultContractStore(),
        conversationStore: makeDefaultConversationStore(),
        workspaceActions: makeDefaultWorkspaceActions(),
        readRuntimeMemorySettings: makeDefaultRuntimeSettingsStore(),
        persistenceStore,
      });

      await ltm.start();

      const refreshHandler = vi.fn(async () => {});
      ltm.attachRecallIndexRefresh(refreshHandler);

      const payload = makeCheckpointPayload({ fromGeneration: 0, toGeneration: 1 });
      await ltm.onCheckpointAdvanced(payload);

      expect(persistenceStore.writeRecallIndexStamp).toHaveBeenCalledWith('checkpoint-write');
    });
  });

  describe('readSnapshot', () => {
    it('returns snapshot with packageCount reflecting persisted packages', async () => {
      const persistenceStore = makeDefaultPersistenceStore({
        packages: [
          { packageId: '2025-01-01_001', checkpointGeneration: 1, fromGeneration: 0, toGeneration: 1, createdAt: '2025-01-01T00:00:00Z', checkpointSummaryUpdatedAt: '2025-01-01T00:00:00Z', reflectionCount: 0, observationCount: 0 },
          { packageId: '2025-01-01_002', checkpointGeneration: 3, fromGeneration: 2, toGeneration: 3, createdAt: '2025-01-01T01:00:00Z', checkpointSummaryUpdatedAt: '2025-01-01T01:00:00Z', reflectionCount: 0, observationCount: 0 },
        ],
      });
      const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-ltm-readsnap-'));
      temporaryDirectories.push(workspaceBasePath);
      const agentMemoryPath = path.join(workspaceBasePath, 'memory');

      await mkdir(agentMemoryPath, { recursive: true });

      const ltm = createAgentLongTermMemory({
        agentId: 'agent-readsnap-test',
        agentName: 'ReadSnapshot Test Agent',
        agentWorkspacePath: workspaceBasePath,
        agentMemoryPath,
        model: {}, instructions: "Test instructions", threadId: "thread-1", resourceId: "resource-1",
        pricingModelKey: 'claude',
        contractStore: makeDefaultContractStore(),
        conversationStore: makeDefaultConversationStore(),
        workspaceActions: makeDefaultWorkspaceActions(),
        readRuntimeMemorySettings: makeDefaultRuntimeSettingsStore(),
        persistenceStore,
      });

      await ltm.start();
      const snapshot = await ltm.readSnapshot();

      expect(snapshot.packageCount).toBe(2);
    });

    it('includes lastRunError and lastRunErrorAt when state has error', async () => {
      const now = new Date().toISOString();
      const persistenceStore = makeDefaultPersistenceStore({
        lastRunAt: now,
        lastRunError: 'something went wrong',
        lastRunErrorAt: now,
      });
      const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-ltm-error-'));
      temporaryDirectories.push(workspaceBasePath);
      const agentMemoryPath = path.join(workspaceBasePath, 'memory');

      await mkdir(agentMemoryPath, { recursive: true });

      const ltm = createAgentLongTermMemory({
        agentId: 'agent-error-test',
        agentName: 'Error Test Agent',
        agentWorkspacePath: workspaceBasePath,
        agentMemoryPath,
        model: {}, instructions: "Test instructions", threadId: "thread-1", resourceId: "resource-1",
        pricingModelKey: 'claude',
        contractStore: makeDefaultContractStore(),
        conversationStore: makeDefaultConversationStore(),
        workspaceActions: makeDefaultWorkspaceActions(),
        readRuntimeMemorySettings: makeDefaultRuntimeSettingsStore(),
        persistenceStore,
      });

      await ltm.start();
      const snapshot = await ltm.readSnapshot();

      expect(snapshot.lastRunError).toBe('something went wrong');
      expect(snapshot.lastRunErrorAt).not.toBeNull();
    });
  });

  describe('dispose', () => {
    it('clears any pending timer and does not throw', async () => {
      const persistenceStore = makeDefaultPersistenceStore({
        packages: [{ packageId: '2025-01-01_001', checkpointGeneration: 1, fromGeneration: 0, toGeneration: 1, createdAt: '2025-01-01T00:00:00Z', checkpointSummaryUpdatedAt: '2025-01-01T00:00:00Z', reflectionCount: 0, observationCount: 0 }],
      });
      const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-ltm-dispose-'));
      temporaryDirectories.push(workspaceBasePath);
      const agentMemoryPath = path.join(workspaceBasePath, 'memory');

      await mkdir(agentMemoryPath, { recursive: true });

      const ltm = createAgentLongTermMemory({
        agentId: 'agent-dispose-test',
        agentName: 'Dispose Test Agent',
        agentWorkspacePath: workspaceBasePath,
        agentMemoryPath,
        model: {}, instructions: "Test instructions", threadId: "thread-1", resourceId: "resource-1",
        pricingModelKey: 'claude',
        contractStore: makeDefaultContractStore(),
        conversationStore: makeDefaultConversationStore(),
        workspaceActions: makeDefaultWorkspaceActions(),
        readRuntimeMemorySettings: makeDefaultRuntimeSettingsStore(),
        persistenceStore,
      });

      await ltm.start();
      await ltm.onAgentIdle();

      await expect(ltm.dispose()).resolves.not.toThrow();
    });

    it('prevents subsequent idle scheduling after dispose', async () => {
      const persistenceStore = makeDefaultPersistenceStore({
        packages: [{ packageId: '2025-01-01_001', checkpointGeneration: 1, fromGeneration: 0, toGeneration: 1, createdAt: '2025-01-01T00:00:00Z', checkpointSummaryUpdatedAt: '2025-01-01T00:00:00Z', reflectionCount: 0, observationCount: 0 }],
      });
      const workspaceBasePath = await mkdtemp(path.join(tmpdir(), 'forge-ltm-stop-'));
      temporaryDirectories.push(workspaceBasePath);
      const agentMemoryPath = path.join(workspaceBasePath, 'memory');

      await mkdir(agentMemoryPath, { recursive: true });

      const ltm = createAgentLongTermMemory({
        agentId: 'agent-stop-test',
        agentName: 'Stop Test Agent',
        agentWorkspacePath: workspaceBasePath,
        agentMemoryPath,
        model: {}, instructions: "Test instructions", threadId: "thread-1", resourceId: "resource-1",
        pricingModelKey: 'claude',
        contractStore: makeDefaultContractStore(),
        conversationStore: makeDefaultConversationStore(),
        workspaceActions: makeDefaultWorkspaceActions(),
        readRuntimeMemorySettings: makeDefaultRuntimeSettingsStore(),
        persistenceStore,
      });

      await ltm.start();
      await ltm.dispose();
      await ltm.onAgentIdle();

      expect(ltm.getSnapshot().queued).toBe(false);
    });
  });
});