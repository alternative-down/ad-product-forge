import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mock order matters: hoisted first, before any imports ─────────────────

vi.mock('@forge-runtime/core', () => ({ forgeDebug: vi.fn() }));

// Track runner instances keyed by runtime id
const mockRunnerInstances = new Map<string, any>();

vi.mock('../agents/agent-runner', () => ({
  createAgentRunner: vi.fn((_db, runtime) => {
    const runner = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      notifyExternalEvent: vi.fn(),
      forceIdle: vi.fn(),
      getSnapshot: vi.fn().mockReturnValue({ wake: { events: [] }, pendingRunEvents: [] }),
    };
    mockRunnerInstances.set(runtime.id, runner as any as any);
    return runner;
  }),
}));

vi.mock('../agents/agent-loader', () => ({
  loadAgents: vi.fn(),
  loadAgent: vi.fn(),
}));

// Shared registry state — same object across all calls to getInternalAgentRegistry()
const registryState = new Map<string, { id: string; runner: ReturnType<typeof vi.fn> }>();
const registry = {
  get: vi.fn((id: string) => registryState.get(id)),
  add: vi.fn(async (_db: unknown, runtime: { id: string } | undefined) => {
    if (!runtime) return;
    registryState.set(runtime.id, {
      id: runtime.id,
      runner: mockRunnerInstances.get(runtime.id) ?? vi.fn(),
    });
  }),
  delete: vi.fn((id: string) => registryState.delete(id)),
};

vi.mock('../agents/internal-agent-registry', () => ({
  getInternalAgentRegistry: vi.fn(() => registry),
}));

vi.mock('../notifications/store', () => ({
  createAgentNotificationStore: vi.fn(() => ({
    createNotification: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../encryption/crypto', () => ({
  decryptSecret: vi.fn((text: string) => text),
  encryptSecret: vi.fn((text: string) => `encrypted:${text}`),
}));

// ── Imports (after all mocks) ───────────────────────────────────────────────

import {
  reloadAgentIfLoaded,
  reloadAgentsForRole,
  changeAgentRole,
  changeAgentRoleFromAdmin,
  updateInternalChatProviderProfile,
} from './runtime';
import type { Database } from '../database/client';
import type { InternalChatService } from '../communication/internal-chat-service';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeMinimalInternalChat(): InternalChatService {
  return {
    registerAgentAccount: vi.fn().mockResolvedValue(undefined),
    sendDirectMessage: vi.fn(),
    sendGroupMessage: vi.fn(),
    getConversationsForAgent: vi.fn().mockResolvedValue([]),
    getRecentMessages: vi.fn().mockResolvedValue([]),
    registerToolResultHandler: vi.fn(),
    onWakeEvent: vi.fn(),
    onInternalMessage: vi.fn(),
    onContractEvent: vi.fn(),
    onCapabilityEvent: vi.fn(),
    onAgentRoleChange: vi.fn(),
  } as unknown as InternalChatService;
}

function makeConfig() {
  return {
    workspaceBasePath: '/workspaces/forge',
    githubApps: {} as import('../github/manager').GitHubAppManager,
    emailMailboxes: null,
    coolify: null,
    schedules: {} as any,
    internalChat: makeMinimalInternalChat(),
  };
}

function makeDb(overrides: Partial<Database> = {}): Database {
  return {
    query: {
      agents: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      agentRoles: {
        findFirst: vi.fn(),
      },
      agentProviders: {
        findFirst: vi.fn(),
      },
    },
    update: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as unknown as Database;
}

function makeAgent(id: string, name: string, roleId?: string) {
  return { id, name, roleId, createdAt: 0, updatedAt: 0 };
}

function makeRole(id: string, name: string, description?: string) {
  return { id, name, description: description ?? null, createdAt: 0, updatedAt: 0 };
}

function makeProvider(id: string, agentId: string, encryptedCredentials: string) {
  return {
    id,
    agentId,
    providerType: 'internal-chat' as const,
    encryptedCredentials,
    createdAt: 0,
    updatedAt: 0,
  };
}

function makeUpdateChain() {
  return { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('capabilities/runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registryState.clear();
    mockRunnerInstances.clear();
  });

  // ── reloadAgentIfLoaded ──────────────────────────────────────────────────

  describe('reloadAgentIfLoaded', () => {
    it('returns early when agent is not in the registry', async () => {
      const { loadAgent } = await import('../agents/agent-loader');

      await reloadAgentIfLoaded(makeDb(), makeConfig(), 'ag_001');

      expect(registry.get).toHaveBeenCalledWith('ag_001');
      expect(loadAgent).not.toHaveBeenCalled();
    });

    it('loads and re-adds the agent when it is in the registry', async () => {
      registryState.set('ag_001', { id: 'ag_001', runner: vi.fn() });
      const { loadAgent } = await import('../agents/agent-loader');
      (loadAgent as any).mockResolvedValue({
        id: 'ag_001',
        name: 'Test',
        dispose: vi.fn(),
      } as never);

      const db = makeDb();
      const config = makeConfig();
      await reloadAgentIfLoaded(db, config, 'ag_001');

      expect(loadAgent).toHaveBeenCalledWith(db, { ...config, agentId: 'ag_001' });
      expect(registry.add).toHaveBeenCalled();
    });
  });

  // ── reloadAgentsForRole ──────────────────────────────────────────────────

  describe('reloadAgentsForRole', () => {
    it('queries agents by roleId and reloads each', async () => {
      const db = makeDb();
      db.query.agents.findMany = vi.fn().mockResolvedValue([{ id: 'ag_001' }, { id: 'ag_002' }]);
      registryState.set('ag_001', { id: 'ag_001', runner: vi.fn() });
      registryState.set('ag_002', { id: 'ag_002', runner: vi.fn() });

      const { loadAgent } = await import('../agents/agent-loader');
      (loadAgent as any).mockResolvedValue({ id: '', name: 'Test', dispose: vi.fn() } as never);

      await reloadAgentsForRole(db, makeConfig(), 'role_dev');

      expect(db.query.agents.findMany).toHaveBeenCalled();
      const findManyCall = vi.mocked(db.query.agents.findMany).mock.calls[0]![0] as any;
      expect(findManyCall.columns).toEqual({ id: true });
      expect(loadAgent).toHaveBeenCalledTimes(2);
    });

    it('handles empty agent list gracefully', async () => {
      const db = makeDb();
      db.query.agents.findMany = vi.fn().mockResolvedValue([]);
      const { loadAgent } = await import('../agents/agent-loader');

      await reloadAgentsForRole(db, makeConfig(), 'role_empty');

      expect(loadAgent).not.toHaveBeenCalled();
    });
  });

  // ── changeAgentRole ──────────────────────────────────────────────────────

  describe('changeAgentRole', () => {
    it('throws when actor agent is not found', async () => {
      const db = makeDb();
      db.query.agents.findFirst = vi.fn().mockResolvedValue(null);

      await expect(
        changeAgentRole({
          db,
          loaderConfig: makeConfig(),
          actorAgentId: 'ag_missing',
          targetAgentId: 'ag_001',
          roleId: 'role_dev',
        }),
      ).rejects.toThrow('Actor agent not found');
    });

    it('throws when target agent is not found', async () => {
      const db = makeDb();
      db.query.agents.findFirst = vi
        .fn()
        .mockResolvedValueOnce(makeAgent('ag_actor', 'Actor'))
        .mockResolvedValueOnce(null);

      await expect(
        changeAgentRole({
          db,
          loaderConfig: makeConfig(),
          actorAgentId: 'ag_actor',
          targetAgentId: 'ag_missing',
          roleId: 'role_dev',
        }),
      ).rejects.toThrow('Target agent not found');
    });

    it('throws when role is not found', async () => {
      const db = makeDb();
      db.query.agents.findFirst = vi
        .fn()
        .mockResolvedValueOnce(makeAgent('ag_actor', 'Actor'))
        .mockResolvedValueOnce(makeAgent('ag_target', 'Target'))
        .mockResolvedValueOnce(null);

      await expect(
        changeAgentRole({
          db,
          loaderConfig: makeConfig(),
          actorAgentId: 'ag_actor',
          targetAgentId: 'ag_target',
          roleId: 'role_missing',
        }),
      ).rejects.toThrow('Role not found');
    });

    it('updates agent role, notifies, reloads, and returns the result', async () => {
      const actor = makeAgent('ag_actor', 'Actor');
      const target = makeAgent('ag_target', 'Target', 'role_dev');
      const role = makeRole('role_dev', 'Developer', 'Developer description');

      const db = makeDb();
      db.query.agents.findFirst = vi
        .fn()
        .mockResolvedValueOnce(actor)
        .mockResolvedValueOnce(target)
        .mockResolvedValueOnce(role);
      db.query.agentRoles.findFirst = vi.fn().mockResolvedValueOnce(role);

      db.update = vi.fn().mockReturnValue(makeUpdateChain());
      (db.query as any).agentProviders = { findFirst: vi.fn().mockResolvedValue(null) };

      const { createAgentNotificationStore } = await import('../notifications/store');
      const { loadAgent } = await import('../agents/agent-loader');
      const mockRunner = { notifyExternalEvent: vi.fn(), run: vi.fn() } as any;
      registryState.set('ag_target', { id: 'ag_target', runner: mockRunner });
      (loadAgent as any).mockResolvedValue(undefined);

      const result = await changeAgentRole({
        db,
        loaderConfig: makeConfig(),
        actorAgentId: 'ag_actor',
        targetAgentId: 'ag_target',
        roleId: 'role_dev',
      });

      expect(result).toMatchObject({
        agentId: 'ag_target',
        roleId: 'role_dev',
        roleName: 'Developer',
        changedByAgentId: 'ag_actor',
      });
      expect(db.update).toHaveBeenCalled();
      expect(
        vi.mocked(createAgentNotificationStore).mock.results[0]?.value.createNotification,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'ag_target',
          content: expect.stringContaining('Agent role assignment changed'),
        }),
      );
      expect(loadAgent).toHaveBeenCalled();
    });

    it('marks actor as self when actor equals target', async () => {
      const agent = makeAgent('ag_self', 'Self Agent', 'role_dev');
      const role = makeRole('role_dev', 'Developer');

      const db = makeDb();
      db.query.agents.findFirst = vi.fn().mockResolvedValueOnce(agent).mockResolvedValueOnce(agent);
      db.query.agentRoles.findFirst = vi.fn().mockResolvedValueOnce(role);

      db.update = vi.fn().mockReturnValue(makeUpdateChain());

      const { createAgentNotificationStore } = await import('../notifications/store');
      const { loadAgent } = await import('../agents/agent-loader');
      const mockRunner = { notifyExternalEvent: vi.fn(), run: vi.fn() } as any;
      registryState.set('ag_self', { id: 'ag_self', runner: mockRunner });
      (loadAgent as any).mockResolvedValue(undefined);

      await changeAgentRole({
        db,
        loaderConfig: makeConfig(),
        actorAgentId: 'ag_self',
        targetAgentId: 'ag_self',
        roleId: 'role_dev',
      });

      const mockStore = vi.mocked(createAgentNotificationStore).mock.results[0]?.value;
      expect(mockStore?.createNotification).toHaveBeenCalled();
      const call = mockStore?.createNotification.mock.calls[0][0];
      expect(call.content).toContain('Self Agent (self)');
    });
  });

  // ── changeAgentRoleFromAdmin ─────────────────────────────────────────────

  describe('changeAgentRoleFromAdmin', () => {
    it('throws when target agent is not found', async () => {
      const db = makeDb();
      db.query.agents.findFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      await expect(
        changeAgentRoleFromAdmin({
          db,
          loaderConfig: makeConfig(),
          targetAgentId: 'ag_missing',
          roleId: 'role_dev',
        }),
      ).rejects.toThrow('Target agent not found');
    });

    it('throws when role is not found', async () => {
      const db = makeDb();
      db.query.agents.findFirst = vi
        .fn()
        .mockResolvedValueOnce(makeAgent('ag_001', 'Target'))
        .mockResolvedValueOnce(null);

      await expect(
        changeAgentRoleFromAdmin({
          db,
          loaderConfig: makeConfig(),
          targetAgentId: 'ag_001',
          roleId: 'role_missing',
        }),
      ).rejects.toThrow('Role not found');
    });

    it('updates agent role with admin label and returns correct shape', async () => {
      const target = makeAgent('ag_target', 'Target Agent', 'role_qa');
      const role = makeRole('role_qa', 'QA Engineer', 'QA role description');

      const db = makeDb();
      db.query.agents.findFirst = vi.fn().mockResolvedValueOnce(target);
      db.query.agentRoles.findFirst = vi.fn().mockResolvedValueOnce(role);

      db.update = vi.fn().mockReturnValue(makeUpdateChain());

      const { createAgentNotificationStore } = await import('../notifications/store');
      const { loadAgent } = await import('../agents/agent-loader');
      const mockRunner = { notifyExternalEvent: vi.fn(), run: vi.fn() } as any;
      registryState.set('ag_target', { id: 'ag_target', runner: mockRunner });
      (loadAgent as any).mockResolvedValue(undefined);

      const result = await changeAgentRoleFromAdmin({
        db,
        loaderConfig: makeConfig(),
        targetAgentId: 'ag_target',
        roleId: 'role_qa',
      });

      expect(result).toMatchObject({
        agentId: 'ag_target',
        roleId: 'role_qa',
        roleName: 'QA Engineer',
        changedBy: 'admin-console',
      });
      const mockStore = vi.mocked(createAgentNotificationStore).mock.results[0]?.value;
      expect(mockStore?.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'ag_target' }),
      );
      expect(loadAgent).toHaveBeenCalled();
    });
  });

  // ── updateInternalChatProviderProfile ───────────────────────────────────

  describe('updateInternalChatProviderProfile', () => {
    it('returns early when no provider exists for the agent', async () => {
      const db = makeDb();

      await updateInternalChatProviderProfile(db, {
        agentId: 'ag_no_provider',
        displayName: 'No Provider Agent',
        description: 'Has no internal-chat provider',
      });

      expect(db.query.agentProviders.findFirst).toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('decrypts, updates, and encrypts provider credentials when provider exists', async () => {
      const storedCredentials = JSON.stringify({ agentId: 'ag_old', displayName: 'Old Name' });
      const provider = makeProvider('prov_001', 'ag_001', storedCredentials);

      const db = makeDb();
      (db.query as any).agentProviders = { findFirst: vi.fn().mockResolvedValue(provider) };
      db.update = vi.fn().mockReturnValue(makeUpdateChain());

      const { decryptSecret, encryptSecret } = await import('../encryption/crypto');

      await updateInternalChatProviderProfile(db, {
        agentId: 'ag_001',
        displayName: 'Updated Name',
        description: 'Updated description',
      });

      expect(decryptSecret).toHaveBeenCalledWith(storedCredentials);
      expect(encryptSecret).toHaveBeenCalledWith(
        expect.stringContaining('"displayName":"Updated Name"'),
      );
    });

    it('preserves other credential fields when updating profile', async () => {
      const storedCredentials = JSON.stringify({
        agentId: 'ag_001',
        displayName: 'Old',
        description: 'Old desc',
        customField: 'keepThis',
      });
      const provider = makeProvider('prov_001', 'ag_001', storedCredentials);

      const db = makeDb();
      (db.query as any).agentProviders = { findFirst: vi.fn().mockResolvedValue(provider) };
      db.update = vi.fn().mockReturnValue(makeUpdateChain());

      const { encryptSecret } = await import('../encryption/crypto');

      await updateInternalChatProviderProfile(db, {
        agentId: 'ag_001',
        displayName: 'New Name',
        description: 'New desc',
      });

      const call = vi.mocked(encryptSecret).mock.calls[0][0] as string;
      expect(call).toContain('"customField":"keepThis"');
    });

    it('logs and returns early when decryptSecret throws', async () => {
      const provider = makeProvider('prov_001', 'ag_001', 'encrypted');

      const db = makeDb();
      (db.query as any).agentProviders = { findFirst: vi.fn().mockResolvedValue(provider) };

      const { decryptSecret } = await import('../encryption/crypto');
      vi.mocked(decryptSecret).mockImplementationOnce(() => {
        throw new Error('decryption failed');
      });

      await updateInternalChatProviderProfile(db, {
        agentId: 'ag_001',
        displayName: 'Name',
        description: 'Desc',
      });

      expect(db.update).not.toHaveBeenCalled();
    });

    it('logs and returns early when DB update throws', async () => {
      const storedCredentials = JSON.stringify({ agentId: 'ag_001', displayName: 'Old' });
      const provider = makeProvider('prov_001', 'ag_001', storedCredentials);

      const db = makeDb();
      (db.query as any).agentProviders = { findFirst: vi.fn().mockResolvedValue(provider) };

      const updateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockRejectedValue(new Error('db update failed')),
      };
      db.update = vi.fn().mockReturnValue(updateChain);

      await updateInternalChatProviderProfile(db, {
        agentId: 'ag_001',
        displayName: 'New Name',
        description: 'Desc',
      });

      expect(updateChain.set).toHaveBeenCalled();
    });
  });
});
