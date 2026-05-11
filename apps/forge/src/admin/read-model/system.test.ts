import { describe, expect, test, vi } from 'vitest';

const mockGroupByAll = vi.fn();
const mockDb = {
  all: vi.fn(),
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      groupBy: vi.fn().mockReturnValue({ all: mockGroupByAll }),
    }),
  }),
  query: { agents: { findMany: vi.fn() } },
} as any;

const mocks = vi.hoisted(() => ({
  capabilityStore: {
    listRoles: vi.fn(),
    listGrantedRoleCapabilities: vi.fn(),
    listGrantedRoleCapabilitiesBatch: vi.fn(),
  },
  integrationStore: {
    listIntegrations: vi.fn(),
  },
  llmSettingsStore: {
    listProfiles: vi.fn(),
    getDefaults: vi.fn(),
  },
  llmModelPriceStore: {
    listPrices: vi.fn(),
  },
  systemSettingsStore: {
    getSettings: vi.fn(),
  },
}));

vi.mock('../../capabilities/store', () => ({
  createCapabilityStore: vi.fn(() => mocks.capabilityStore),
}));

vi.mock('../../system-integrations/store', () => ({
  createSystemIntegrationStore: vi.fn(() => mocks.integrationStore),
}));

vi.mock('../../llm/settings-store', () => ({
  createLlmSettingsStore: vi.fn(() => mocks.llmSettingsStore),
}));

vi.mock('../../llm/model-price-store', () => ({
  createLlmModelPriceStore: vi.fn(() => mocks.llmModelPriceStore),
}));

vi.mock('../../system-settings/store', () => ({
  createSystemSettingsStore: vi.fn(() => mocks.systemSettingsStore),
}));

vi.mock('../../database/schema', () => ({
  agents: {},
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('node:path', () => ({
  resolve: vi.fn().mockReturnValue('/migrations/meta/_journal.json'),
}));

import { createSystemReadModel } from './system';

describe('createSystemReadModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listSystemIntegrations', () => {
    test('returns integrations from integration store', async () => {
      const fakeIntegrations = [
        { id: 'int1', name: 'GitHub', type: 'github', config: {} },
        { id: 'int2', name: 'Coolify', type: 'coolify', config: {} },
      ];
      mocks.integrationStore.listIntegrations.mockResolvedValue(fakeIntegrations);

      const store = createSystemReadModel({ db: mockDb });
      const result = await store.listSystemIntegrations();

      expect(mocks.integrationStore.listIntegrations).toHaveBeenCalled();
      expect(result).toEqual(fakeIntegrations);
    });
  });

  describe('getSystemLlm', () => {
    test('returns profiles, defaults, and prices in parallel', async () => {
      const profiles = [{ profileId: 'p1', modelKey: 'claude-3-5-sonnet' }];
      const defaults = { modelKey: 'claude-3-5-sonnet', providerId: 'anthropic' };
      const prices = [{ modelKey: 'claude-3-5-sonnet', inputCostPerMtok: 3, outputCostPerMtok: 15 }];

      mocks.llmSettingsStore.listProfiles.mockResolvedValue(profiles);
      mocks.llmSettingsStore.getDefaults.mockResolvedValue(defaults);
      mocks.llmModelPriceStore.listPrices.mockResolvedValue(prices);

      const store = createSystemReadModel({ db: mockDb });
      const result = await store.getSystemLlm();

      expect(result.profiles).toEqual(profiles);
      expect(result.defaults).toEqual(defaults);
      expect(result.prices).toEqual(prices);
    });

    test('returns empty results when stores return empty arrays', async () => {
      mocks.llmSettingsStore.listProfiles.mockResolvedValue([]);
      mocks.llmSettingsStore.getDefaults.mockResolvedValue({});
      mocks.llmModelPriceStore.listPrices.mockResolvedValue([]);

      const store = createSystemReadModel({ db: mockDb });
      const result = await store.getSystemLlm();

      expect(result.profiles).toEqual([]);
      expect(result.prices).toEqual([]);
    });
  });

  describe('getSystemSettings', () => {
    test('returns settings from systemSettings store', async () => {
      const fakeSettings = {
        companyName: 'Test Corp',
        ltmRecallSearchMode: 'hybrid',
        ltmRecallWorkspaceTopK: 3,
      };
      mocks.systemSettingsStore.getSettings.mockResolvedValue(fakeSettings);

      const store = createSystemReadModel({ db: mockDb });
      const result = await store.getSystemSettings();

      expect(mocks.systemSettingsStore.getSettings).toHaveBeenCalled();
      expect(result).toEqual(fakeSettings);
    });
  });

  describe('getApplicationMigrations', () => {
    test('reads journal file and queries applied migrations', async () => {
      const { readFile } = await import('node:fs/promises');
      const { resolve } = await import('node:path');

      vi.mocked(readFile).mockResolvedValue(JSON.stringify({
        entries: [
          { idx: 0, when: 1700000000, tag: 'init' },
          { idx: 1, when: 1700000001, tag: 'add_roles' },
        ],
      }));
      mockDb.all.mockResolvedValue([
        { id: 1, hash: 'abc123', createdAt: 1700000000 },
      ]);

      const store = createSystemReadModel({ db: mockDb });
      const result = await store.getApplicationMigrations();

      expect(result.applied).toHaveLength(1);
      expect(result.applied[0]).toMatchObject({ id: 1, hash: 'abc123' });
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]).toMatchObject({
        idx: 0, tag: 'init', applied: true, hash: 'abc123', rowId: 1,
      });
      expect(result.entries[1]).toMatchObject({
        idx: 1, tag: 'add_roles', applied: false, hash: null, rowId: null,
      });
    });

    test('marks migration as applied when matching hash found', async () => {
      const { readFile } = await import('node:fs/promises');
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({
        entries: [{ idx: 0, when: 1700000005, tag: 'v2' }],
      }));
      mockDb.all.mockResolvedValue([
        { id: 10, hash: 'xyz789', createdAt: 1700000005 },
      ]);

      const store = createSystemReadModel({ db: mockDb });
      const result = await store.getApplicationMigrations();

      expect(result.entries[0].applied).toBe(true);
      expect(result.entries[0].hash).toBe('xyz789');
    });

    test('returns empty when no migrations applied', async () => {
      const { readFile } = await import('node:fs/promises');
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ entries: [] }));
      mockDb.all.mockResolvedValue([]);

      const store = createSystemReadModel({ db: mockDb });
      const result = await store.getApplicationMigrations();

      expect(result.applied).toEqual([]);
      expect(result.entries).toEqual([]);
    });
  });
  describe('listRoles', () => {
    const mockRoles = [
      { roleId: 'role-1', name: 'Admin', description: 'Admin role', createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-01') },
      { roleId: 'role-2', name: 'Viewer', description: 'Read-only role', createdAt: new Date('2024-01-02'), updatedAt: new Date('2024-01-02') },
    ];

    test('returns roles with capabilityIds from batch query', async () => {
      const mockCapabilitiesMap = new Map([
        ['role-1', ['cap:read', 'cap:write']],
        ['role-2', ['cap:read']],
      ]);
      mocks.capabilityStore.listGrantedRoleCapabilitiesBatch.mockResolvedValue(mockCapabilitiesMap);
      mocks.capabilityStore.listRoles.mockResolvedValue(mockRoles);
      mockDb.all.mockResolvedValue([]);
      mockGroupByAll.mockResolvedValue([{ roleId: 'role-1', count: 3 }, { roleId: 'role-2', count: 1 }]);

      const store = createSystemReadModel({ db: mockDb });
      const result = await store.listRoles();

      expect(result.items).toHaveLength(2);
      expect(result.items[0].roleId).toBe('role-1');
      expect(result.items[0].assignedAgentCount).toBe(3);
      expect(result.items[0].capabilityIds).toEqual(['cap:read', 'cap:write']);
      expect(result.items[1].roleId).toBe('role-2');
      expect(result.items[1].assignedAgentCount).toBe(1);
      expect(result.items[1].capabilityIds).toEqual(['cap:read']);
    });

    test('returns empty items when no roles exist', async () => {
      mocks.capabilityStore.listGrantedRoleCapabilitiesBatch.mockResolvedValue(new Map());
      mocks.capabilityStore.listRoles.mockResolvedValue([]);
      mockDb.all.mockResolvedValue([]);
      mockGroupByAll.mockResolvedValue([]);

      const store = createSystemReadModel({ db: mockDb });
      const result = await store.listRoles();

      expect(result.items).toEqual([]);
      expect(result.availableCapabilityIds).toBeDefined();
    });

    test('uses empty capabilityIds when batch returns no match for a role', async () => {
      const mockCapabilitiesMap = new Map([
        ['role-1', ['cap:read']],
      ]);
      mocks.capabilityStore.listGrantedRoleCapabilitiesBatch.mockResolvedValue(mockCapabilitiesMap);
      mocks.capabilityStore.listRoles.mockResolvedValue(mockRoles);
      mockDb.all.mockResolvedValue([]);
      mockGroupByAll.mockResolvedValue([]);

      const store = createSystemReadModel({ db: mockDb });
      const result = await store.listRoles();

      expect(result.items[0].capabilityIds).toEqual(['cap:read']);
      expect(result.items[1].capabilityIds).toEqual([]);
    });

    test('logs and re-throws on error', async () => {
      mocks.capabilityStore.listRoles.mockRejectedValue(new Error('DB error'));
      mockDb.all.mockResolvedValue([]);

      const store = createSystemReadModel({ db: mockDb });
      await expect(store.listRoles()).rejects.toThrow('DB error');
    });
  });
});
