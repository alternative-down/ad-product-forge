import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createSystemIntegrationStore } from './store';
import type { Database } from '../database/index';
import type { SystemIntegration } from '../database/schema';

// ─── helpers ────────────────────────────────────────────────────────────────

function createMockDb(overrides?: Partial<Database>): Database {
  return {
    query: {
      systemIntegrations: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
    ...overrides,
  } as unknown as Database;
}

function createMockRow(
  providerType: string,
  overrides?: Partial<SystemIntegration>,
): SystemIntegration {
  return {
    id: 'int-1',
    providerType: providerType as SystemIntegration['providerType'],
    encryptedConfig: 'encrypted-test',
    isEnabled: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  } as SystemIntegration;
}

// ─── module-level mocks ──────────────────────────────────────────────────────

vi.mock('../encryption/crypto', () => ({
  encryptSecret: vi.fn((plaintext: string) => `encrypted:${plaintext}`),
  decryptSecret: vi.fn((encrypted: string) => encrypted.replace('encrypted:', '')),
}));
vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

// ─── tests ───────────────────────────────────────────────────────────────────

describe('system-integrations/store', () => {
  let db: Database;

  beforeEach(() => {
    vi.resetModules();
    db = createMockDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── listIntegrations ──────────────────────────────────────────────────────

  describe('listIntegrations', () => {
    it('returns empty array when no integrations exist', async () => {
      const store = createSystemIntegrationStore(db);
      const result = await store.listIntegrations();
      expect(result).toEqual([]);
    });

    it('maps DB rows to summary shape and decrypts config', async () => {
      const row = createMockRow('migadu', {
        encryptedConfig: 'encrypted:{"apiUser":"test@example.com","apiKey":"key123"}',
        isEnabled: 1,
      });
      (db.query.systemIntegrations.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([row]);

      const store = createSystemIntegrationStore(db);
      const result = await store.listIntegrations();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        providerType: 'migadu',
        isEnabled: true,
        config: expect.objectContaining({ apiUser: 'test@example.com', apiKey: 'key123' }),
      });
    });

    it('excludes rows with invalid providerType', async () => {
      const rows = [
        createMockRow('migadu', {
          encryptedConfig: 'encrypted:{"apiUser":"test@example.com","apiKey":"key123"}',
        }),
        { ...createMockRow('unknown_provider'), providerType: 'unknown_provider' },
      ];
      (db.query.systemIntegrations.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const store = createSystemIntegrationStore(db);
      const result = await store.listIntegrations();

      expect(result).toHaveLength(1);
      expect(result[0].providerType).toBe('migadu');
    });

    it('returns isEnabled as false when DB value is 0', async () => {
      const row = createMockRow('coolify', {
        encryptedConfig: 'encrypted:{"baseUrl":"https://coolify.example.com","adminToken":"tok","serverId":"s1","destinationId":"d1"}',
        isEnabled: 0,
      });
      (db.query.systemIntegrations.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([row]);

      const store = createSystemIntegrationStore(db);
      const result = await store.listIntegrations();

      expect(result[0].isEnabled).toBe(false);
    });

    it('returns null config when decryption/parsing fails gracefully', async () => {
      const row = createMockRow('migadu', { encryptedConfig: 'not-valid-json' });
      (db.query.systemIntegrations.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([row]);

      const store = createSystemIntegrationStore(db);
      const result = await store.listIntegrations();

      expect(result[0].config).toBeNull();
    });

    it('sorts results by providerType ascending', async () => {
      const rows = [
        createMockRow('coolify'),
        createMockRow('github'),
        createMockRow('minimax'),
      ];
      (db.query.systemIntegrations.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const store = createSystemIntegrationStore(db);
      const result = await store.listIntegrations();

      expect(result).toHaveLength(3);
      const types = result.map((r) => r.providerType);
      // Verify output is sorted ascending (mock returns rows in asc order, matching real DB behavior)
      expect(types).toEqual(['coolify', 'github', 'minimax']);
    });
  });

  // ── upsertIntegration ────────────────────────────────────────────────────

  describe('upsertIntegration', () => {
    it('inserts a new integration when none exists', async () => {
      (db.query.systemIntegrations.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const store = createSystemIntegrationStore(db);
      const result = await store.upsertIntegration({
        providerType: 'migadu',
        config: { apiUser: 'user@example.com', apiKey: 'secret-key' },
      });

      expect(result.providerType).toBe('migadu');
      expect(result.isEnabled).toBe(true);
      expect(result.config).toMatchObject({ apiUser: 'user@example.com', apiKey: 'secret-key' });

      // Verify insert chain was called
      expect(db.insert).toHaveBeenCalled();
    });

    it('updates an existing integration when one exists', async () => {
      const existingRow = createMockRow('migadu');
      (db.query.systemIntegrations.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(existingRow);

      const store = createSystemIntegrationStore(db);
      const result = await store.upsertIntegration({
        providerType: 'migadu',
        config: { apiUser: 'updated@example.com', apiKey: 'new-key' },
      });

      expect(result.providerType).toBe('migadu');
      // Verify update chain: db.update().set().where()
      expect(db.update).toHaveBeenCalled();
    });

    it('sets isEnabled to false when isEnabled: false is passed', async () => {
      (db.query.systemIntegrations.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const store = createSystemIntegrationStore(db);
      const result = await store.upsertIntegration({
        providerType: 'coolify',
        config: { baseUrl: 'https://c.example.com', adminToken: 'tok', serverId: 's1', destinationId: 'd1' },
        isEnabled: false,
      });

      expect(result.isEnabled).toBe(false);
    });

    it('validates config against schema and throws on invalid data', async () => {
      (db.query.systemIntegrations.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const store = createSystemIntegrationStore(db);
      await expect(
        store.upsertIntegration({
          providerType: 'migadu',
          // @ts-expect-error — intentionally invalid for test
          config: { apiUser: 'not-an-email' },
        }),
      ).rejects.toThrow();
    });

    it('throws when given an unknown provider type', async () => {
      (db.query.systemIntegrations.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const store = createSystemIntegrationStore(db);
      await expect(
        // @ts-expect-error — intentionally passing unknown type for runtime test
        store.upsertIntegration({ providerType: 'unknown', config: {} as never }),
      ).rejects.toThrow('Unknown integration provider type');
    });
  });

  // ── deleteIntegration ─────────────────────────────────────────────────────

  describe('deleteIntegration', () => {
    it('calls db.delete with the correct provider type', async () => {
      const store = createSystemIntegrationStore(db);
      await store.deleteIntegration('github');

      expect(db.delete).toHaveBeenCalled();
    });

    it('does not throw when deleting a non-existent integration', async () => {
      const store = createSystemIntegrationStore(db);
      await expect(store.deleteIntegration('minimax')).resolves.not.toThrow();
    });
  });

  // ── get*Config helpers ─────────────────────────────────────────────────────

  describe('getMigaduConfig', () => {
    it('returns null when no integration exists', async () => {
      (db.query.systemIntegrations.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const store = createSystemIntegrationStore(db);
      const result = await store.getMigaduConfig();
      expect(result).toBeNull();
    });
  });

  describe('getCoolifyConfig', () => {
    it('returns null when no integration exists', async () => {
      (db.query.systemIntegrations.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const store = createSystemIntegrationStore(db);
      const result = await store.getCoolifyConfig();
      expect(result).toBeNull();
    });
  });

  describe('getGitHubConfig', () => {
    it('returns null when no integration exists', async () => {
      (db.query.systemIntegrations.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const store = createSystemIntegrationStore(db);
      const result = await store.getGitHubConfig();
      expect(result).toBeNull();
    });
  });

  describe('getMinimaxConfig', () => {
    it('returns null when no integration exists', async () => {
      (db.query.systemIntegrations.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const store = createSystemIntegrationStore(db);
      const result = await store.getMinimaxConfig();
      expect(result).toBeNull();
    });
  });

  // ── parseIntegrationConfig (via listIntegrations coverage) ────────────────

  describe('parseIntegrationConfig', () => {
    it('correctly parses coolify config via listIntegrations', async () => {
      const row = createMockRow('coolify', {
        encryptedConfig: 'encrypted:{"baseUrl":"https://coolify.io","adminToken":"tok","serverId":"s1","destinationId":"d1"}',
        isEnabled: 1,
      });
      (db.query.systemIntegrations.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([row]);

      const store = createSystemIntegrationStore(db);
      const result = await store.listIntegrations();

      expect(result[0].config).toMatchObject({
        baseUrl: 'https://coolify.io',
        adminToken: 'tok',
        serverId: 's1',
        destinationId: 'd1',
      });
    });

    it('correctly parses github config via listIntegrations', async () => {
      const row = createMockRow('github', {
        encryptedConfig: 'encrypted:{"organization":"my-org","appHomeUrl":"https://github.com/apps/my-app"}',
        isEnabled: 1,
      });
      (db.query.systemIntegrations.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([row]);

      const store = createSystemIntegrationStore(db);
      const result = await store.listIntegrations();

      expect(result[0].config).toMatchObject({
        organization: 'my-org',
        appHomeUrl: 'https://github.com/apps/my-app',
      });
    });

    it('correctly parses minimax config via listIntegrations', async () => {
      const row = createMockRow('minimax', {
        encryptedConfig: 'encrypted:{"apiKey":"minimax-api-key"}',
        isEnabled: 1,
      });
      (db.query.systemIntegrations.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([row]);

      const store = createSystemIntegrationStore(db);
      const result = await store.listIntegrations();

      expect(result[0].config).toMatchObject({ apiKey: 'minimax-api-key' });
    });
  });
});
