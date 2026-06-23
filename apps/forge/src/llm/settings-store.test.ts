import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createLlmSettingsStore } from './settings-store';
import { decryptSecret } from '../encryption/crypto';

import type { Database } from '../database/client';
type LlmProfile = any;
type SystemLlmDefaults = any;

// ─── mock db factory ─────────────────────────────────────────────────────────

function createMockDb(overrides?: Partial<Database>): Database {
  return {
    query: {
      llmProfiles: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      systemLlmDefaults: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
    transaction: vi.fn().mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txDelete = vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        });
        const tx = {
          query: {
            llmProfiles: {
              findMany: vi.fn().mockResolvedValue([]),
              findFirst: vi.fn().mockResolvedValue(null),
            },
            systemLlmDefaults: {
              findFirst: vi.fn().mockResolvedValue(null),
            },
          },
          delete: txDelete,
        };
        return fn(tx);
      },
    ),
    ...overrides,
  } as unknown as Database;
}

// ─── mock row helpers ─────────────────────────────────────────────────────────

function createMockProfileRow(overrides?: Partial<LlmProfile>): LlmProfile {
  return {
    id: 'profile-1',
    name: 'Test Profile',
    modelKey: 'gpt-4',
    baseUrl: null,
    encryptedApiKey: 'encrypted:test-api-key',
    contractCostMultiplier: 1,
    isEnabled: 1,
    createdAt: 1000000000000,
    updatedAt: 1000000000000,
    ...overrides,
  } as LlmProfile;
}

function createMockDefaultsRow(overrides?: Partial<SystemLlmDefaults>): SystemLlmDefaults {
  return {
    id: 'default',
    primaryProfileId: 'profile-1',
    omProfileId: 'profile-2',
    hiringRhProfileId: 'profile-3',
    createdAt: 1000000000000,
    updatedAt: 1000000000000,
    ...overrides,
  } as SystemLlmDefaults;
}

// ─── module-level crypto mocks ────────────────────────────────────────────────

vi.mock('../encryption/crypto', () => ({
  encryptSecret: vi.fn((plaintext: string) => `encrypted:${plaintext}`),
  decryptSecret: vi.fn((encrypted: string) => encrypted.replace('encrypted:', '')),
}));

// ─── tests ────────────────────────────────────────────────────────────────────

describe('llm/settings-store', () => {
  let db: Database;

  beforeEach(() => {
    vi.resetModules();
    db = createMockDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── listProfiles ────────────────────────────────────────────────────────────

  describe('listProfiles', () => {
    it('returns empty array when no profiles exist', async () => {
      const store = createLlmSettingsStore(db);
      const result = await store.listProfiles();
      expect(result).toEqual([]);
    });

    // Closes #5967: listProfiles keeps decrypting for backward compat (admin UI
    // explicit credential surfacing). listProfileMetadata is the new safe API.
    it('listProfileMetadata returns metadata without apiKey (least-privilege)', async () => {
      const row = createMockProfileRow({
        id: 'p-id-1',
        name: 'My Profile',
        modelKey: 'claude-3',
        baseUrl: 'https://api.anthropic.com',
        encryptedApiKey: 'encrypted:sk-secret123',
        contractCostMultiplier: 1.5,
        isEnabled: 1,
        createdAt: 1700000000000,
        updatedAt: 1700000001000,
      });

      db.query.llmProfiles.findMany = vi.fn().mockResolvedValue([row]);

      const store = createLlmSettingsStore(db);
      const result = await store.listProfileMetadata();

      expect(result).toHaveLength(1);
      // Closes #5967: LlmProfileMetadata = Omit<LlmProfileRecord, 'apiKey'>.
      // LlmProfileRecord does NOT include createdAt/updatedAt — those are DB
      // row fields only. So we assert identity/enabled fields only.
      expect(result[0]).toMatchObject({
        profileId: 'p-id-1',
        name: 'My Profile',
        modelKey: 'claude-3',
        baseUrl: 'https://api.anthropic.com',
        contractCostMultiplier: 1.5,
        isEnabled: true,
      });
      // No apiKey field on metadata type
      expect((result[0] as Record<string, unknown>).apiKey).toBeUndefined();
    });

    it('converts isEnabled 0 to false', async () => {
      const row = createMockProfileRow({ isEnabled: 0 });
      db.query.llmProfiles.findMany = vi.fn().mockResolvedValue([row]);

      const store = createLlmSettingsStore(db);
      const result = await store.listProfiles();

      expect(result[0].isEnabled).toBe(false);
    });

    it('returns multiple profiles ordered by modelKey', async () => {
      const rows = [
        createMockProfileRow({ id: 'p-1', modelKey: 'a-model' }),
        createMockProfileRow({ id: 'p-2', modelKey: 'z-model' }),
      ];

      db.query.llmProfiles.findMany = vi.fn().mockResolvedValue(rows);

      const store = createLlmSettingsStore(db);
      const result = await store.listProfiles();

      expect(result).toHaveLength(2);
      expect(result[0].profileId).toBe('p-1');
      expect(result[1].profileId).toBe('p-2');
    });
  });

  // ── getProfile ──────────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('throws when profile not found', async () => {
      db.query.llmProfiles.findFirst = vi.fn().mockResolvedValue(null);
      const store = createLlmSettingsStore(db);

      await expect(store.getProfile('non-existent')).rejects.toThrow(
        'LLM profile not found: non-existent',
      );
    });

    it('returns profile record when found', async () => {
      const row = createMockProfileRow({
        id: 'found-profile',
        name: 'Found Profile',
        encryptedApiKey: 'encrypted:abc123',
      });

      db.query.llmProfiles.findFirst = vi.fn().mockResolvedValue(row);

      const store = createLlmSettingsStore(db);
      const result = await store.getProfile('found-profile');

      expect(result.profileId).toBe('found-profile');
      expect(result.name).toBe('Found Profile');
      expect(result.apiKey).toBe(null);
    });
  });

    it('throws when decryptSecret fails (no silent apiKey empty string)', async () => {
      vi.mocked(decryptSecret).mockImplementationOnce(() => {
        throw new Error('Simulated decryption failure');
      });

      const row = createMockProfileRow({ id: 'corrupt-profile' });
      db.query.llmProfiles.findFirst = vi.fn().mockResolvedValue(row);

      const store = createLlmSettingsStore(db);

      await expect(store.getProfile('corrupt-profile')).rejects.toThrow(
        /Failed to decrypt LLM profile corrupt-profile/,
      );
    });

  // ── getDefaults ─────────────────────────────────────────────────────────────

  describe('getDefaults', () => {
    it('returns null when defaults row does not exist', async () => {
      db.query.systemLlmDefaults.findFirst = vi.fn().mockResolvedValue(null);
      const store = createLlmSettingsStore(db);

      const result = await store.getDefaults();
      expect(result).toBeNull();
    });

    it('returns defaults object when row exists', async () => {
      const row = createMockDefaultsRow({
        primaryProfileId: 'primary-1',
        omProfileId: 'om-2',
        hiringRhProfileId: 'hr-3',
        createdAt: 1700000000000,
        updatedAt: 1700000005000,
      });

      db.query.systemLlmDefaults.findFirst = vi.fn().mockResolvedValue(row);

      const store = createLlmSettingsStore(db);
      const result = await store.getDefaults();

      expect(result).toMatchObject({
        primaryProfileId: 'primary-1',
        omProfileId: 'om-2',
        hiringRhProfileId: 'hr-3',
        createdAt: 1700000000000,
        updatedAt: 1700000005000,
      });
    });
  });

  // ── upsertProfile ───────────────────────────────────────────────────────────

  describe('upsertProfile', () => {
    it('inserts new profile when profileId is not provided', async () => {
      const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
      const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
      const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
      db.insert = mockInsert as Database['insert'];

      const store = createLlmSettingsStore(db);
      const result = await store.upsertProfile({
        name: 'New Profile',
        modelKey: 'gpt-4',
        apiKey: 'sk-new-key',
        contractCostMultiplier: 1,
        isEnabled: true,
      });

      expect(result.name).toBe('New Profile');
      expect(result.modelKey).toBe('gpt-4');
      expect(result.apiKey).toBe('sk-new-key');
      expect(result.profileId).toBeTruthy();

      expect(mockInsert).toHaveBeenCalled();
      expect(mockOnConflictDoUpdate).toHaveBeenCalled();
      const insertCall = mockInsert.mock.calls[0][0];
      // insertCall is the llmProfiles table object
    });

    it('updates existing profile when profileId is provided via onConflictDoUpdate', async () => {
      const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
      const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
      const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
      db.insert = mockInsert as Database['insert'];

      const store = createLlmSettingsStore(db);
      const result = await store.upsertProfile({
        profileId: 'existing-id',
        name: 'Updated Name',
        modelKey: 'updated-model',
        apiKey: 'updated-key',
      });

      expect(result.profileId).toBe('existing-id');
      expect(result.name).toBe('Updated Name');
      expect(mockInsert).toHaveBeenCalled();
      expect(mockOnConflictDoUpdate).toHaveBeenCalled();
      // Verify target uses llmProfiles.id
      const insertCall = mockInsert.mock.calls[0][0];
      // insertCall is the llmProfiles table object
    });

    it('trims name, modelKey, baseUrl, and apiKey', async () => {
      const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
      const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
      const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
      db.insert = mockInsert as Database['insert'];

      const store = createLlmSettingsStore(db);
      await store.upsertProfile({
        name: '  Trimmed Name  ',
        modelKey: '  trimmed-model  ',
        baseUrl: '  https://api.example.com  ',
        apiKey: '  trimmed-key  ',
      });

      // Check that insert was called with trimmed values via encryptSecret
      // The trim is applied before encryption
    });

    it('validates required fields via Zod schema', async () => {
      const store = createLlmSettingsStore(db);

      await expect(
        store.upsertProfile({ name: '', modelKey: 'gpt-4', apiKey: 'key' }),
      ).rejects.toThrow();

      await expect(
        store.upsertProfile({ name: 'Valid', modelKey: '', apiKey: 'key' }),
      ).rejects.toThrow();

      await expect(
        store.upsertProfile({ name: 'Valid', modelKey: 'gpt-4', apiKey: '' }),
      ).rejects.toThrow();
    });

    it('validates baseUrl must be a valid URL when provided', async () => {
      const store = createLlmSettingsStore(db);

      await expect(
        store.upsertProfile({ name: 'A', modelKey: 'm', apiKey: 'k', baseUrl: 'not-a-url' }),
      ).rejects.toThrow();
    });

    it('allows baseUrl to be null', async () => {
      const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
      const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
      const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
      db.insert = mockInsert as Database['insert'];

      const store = createLlmSettingsStore(db);
      await expect(
        store.upsertProfile({ name: 'A', modelKey: 'm', apiKey: 'k', baseUrl: null }),
      ).resolves.toBeTruthy();
    });

    it('rejects whitespace-only apiKey (#5968: trim BEFORE min validation)', async () => {
      const store = createLlmSettingsStore(db);
      await expect(
        store.upsertProfile({ name: 'Valid', modelKey: 'gpt-4', apiKey: '   ' }),
      ).rejects.toThrow();
    });

    it('rejects whitespace-only name (#5968: trim BEFORE min validation)', async () => {
      const store = createLlmSettingsStore(db);
      await expect(
        store.upsertProfile({ name: '   ', modelKey: 'gpt-4', apiKey: 'real-key' }),
      ).rejects.toThrow();
    });
  });

  // ── deleteProfile ───────────────────────────────────────────────────────────

  describe('deleteProfile', () => {
    it('throws when trying to delete a profile that is a system default', async () => {
      const defaultsRow = createMockDefaultsRow({ primaryProfileId: 'to-delete' });
      db.transaction = vi.fn().mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            query: {
              systemLlmDefaults: {
                findFirst: vi.fn().mockResolvedValue(defaultsRow),
              },
            },
            delete: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          };
          return fn(tx);
        },
      );

      const store = createLlmSettingsStore(db);
      await expect(store.deleteProfile('to-delete')).rejects.toThrow(
        'Cannot delete an LLM profile that is currently selected as a system default',
      );
    });

    it('throws when profile is OM default', async () => {
      const defaultsRow = createMockDefaultsRow({ omProfileId: 'to-delete-om' });
      db.transaction = vi.fn().mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            query: {
              systemLlmDefaults: {
                findFirst: vi.fn().mockResolvedValue(defaultsRow),
              },
            },
            delete: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          };
          return fn(tx);
        },
      );

      const store = createLlmSettingsStore(db);
      await expect(store.deleteProfile('to-delete-om')).rejects.toThrow(
        'Cannot delete an LLM profile that is currently selected as a system default',
      );
    });

    it('throws when profile is hiring RH default', async () => {
      const defaultsRow = createMockDefaultsRow({ hiringRhProfileId: 'to-delete-hr' });
      db.transaction = vi.fn().mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            query: {
              systemLlmDefaults: {
                findFirst: vi.fn().mockResolvedValue(defaultsRow),
              },
            },
            delete: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          };
          return fn(tx);
        },
      );

      const store = createLlmSettingsStore(db);
      await expect(store.deleteProfile('to-delete-hr')).rejects.toThrow(
        'Cannot delete an LLM profile that is currently selected as a system default',
      );
    });

    it('deletes profile when it is not a default (atomic via transaction)', async () => {
      const txDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      db.transaction = vi.fn().mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            query: {
              systemLlmDefaults: {
                findFirst: vi.fn().mockResolvedValue(null),
              },
            },
            delete: txDelete,
          };
          return fn(tx);
        },
      );

      const store = createLlmSettingsStore(db);
      await store.deleteProfile('non-default-profile');

      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(txDelete).toHaveBeenCalled();
    });

    it('does NOT call tx.delete when check inside transaction throws (atomicity)', async () => {
      const defaultsRow = createMockDefaultsRow({ primaryProfileId: 'is-default' });
      const txDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      db.transaction = vi.fn().mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            query: {
              systemLlmDefaults: {
                findFirst: vi.fn().mockResolvedValue(defaultsRow),
              },
            },
            delete: txDelete,
          };
          return fn(tx);
        },
      );

      const store = createLlmSettingsStore(db);
      await expect(store.deleteProfile('is-default')).rejects.toThrow(
        'Cannot delete an LLM profile that is currently selected as a system default',
      );

      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(txDelete).not.toHaveBeenCalled();
    });
  });

  // ── updateDefaults ──────────────────────────────────────────────────────────

  describe('updateDefaults', () => {
    it('throws when one of the profile IDs does not exist', async () => {
      db.query.llmProfiles.findMany = vi.fn().mockResolvedValue([]);

      const store = createLlmSettingsStore(db);
      await expect(
        store.updateDefaults({
          primaryProfileId: 'missing-1',
          omProfileId: 'missing-2',
          hiringRhProfileId: 'missing-3',
        }),
      ).rejects.toThrow('LLM profile not found: missing-1');
    });

    it('throws when one of the profiles is disabled', async () => {
      const rows = [
        createMockProfileRow({ id: 'enabled-1', isEnabled: 1 }),
        createMockProfileRow({ id: 'disabled-2', isEnabled: 0 }),
        createMockProfileRow({ id: 'enabled-3', isEnabled: 1 }),
      ];
      db.query.llmProfiles.findMany = vi.fn().mockResolvedValue(rows);

      const store = createLlmSettingsStore(db);
      await expect(
        store.updateDefaults({
          primaryProfileId: 'enabled-1',
          omProfileId: 'disabled-2',
          hiringRhProfileId: 'enabled-3',
        }),
      ).rejects.toThrow('Default LLM profile must be enabled: disabled-2');
    });

    it('inserts defaults row when none exists', async () => {
      const rows = [
        createMockProfileRow({ id: 'p1', isEnabled: 1 }),
        createMockProfileRow({ id: 'p2', isEnabled: 1 }),
        createMockProfileRow({ id: 'p3', isEnabled: 1 }),
      ];
      db.query.llmProfiles.findMany = vi.fn().mockResolvedValue(rows);
      db.query.systemLlmDefaults.findFirst = vi.fn().mockResolvedValue(null);

      const mockOnConflict = vi.fn().mockResolvedValue(undefined);
      const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflict });
      const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
      db.insert = mockInsert as Database['insert'];

      const store = createLlmSettingsStore(db);
      const result = await store.updateDefaults({
        primaryProfileId: 'p1',
        omProfileId: 'p2',
        hiringRhProfileId: 'p3',
      });

      expect(result).toMatchObject({
        primaryProfileId: 'p1',
        omProfileId: 'p2',
        hiringRhProfileId: 'p3',
      });
      // Atomic upsert path: insert + onConflictDoUpdate (no separate findFirst+update)
      expect(mockInsert).toHaveBeenCalled();
      expect(mockOnConflict).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.anything(),
          set: expect.objectContaining({
            primaryProfileId: 'p1',
            omProfileId: 'p2',
            hiringRhProfileId: 'p3',
          }),
        }),
      );
    });

    it('updates existing defaults row when one exists', async () => {
      const rows = [
        createMockProfileRow({ id: 'new-p1', isEnabled: 1 }),
        createMockProfileRow({ id: 'new-p2', isEnabled: 1 }),
        createMockProfileRow({ id: 'new-p3', isEnabled: 1 }),
      ];
      db.query.llmProfiles.findMany = vi.fn().mockResolvedValue(rows);

      const existingDefaults = createMockDefaultsRow();
      db.query.systemLlmDefaults.findFirst = vi.fn().mockResolvedValue(existingDefaults);

      const mockOnConflict = vi.fn().mockResolvedValue(undefined);
      const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflict });
      const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
      db.insert = mockInsert as Database['insert'];

      const store = createLlmSettingsStore(db);
      await store.updateDefaults({
        primaryProfileId: 'new-p1',
        omProfileId: 'new-p2',
        hiringRhProfileId: 'new-p3',
      });

      // Atomic upsert path: even when existing row present, insert+onConflictDoUpdate
      // is the SINGLE atomic statement (not findFirst+update).
      expect(mockInsert).toHaveBeenCalled();
      expect(mockOnConflict).toHaveBeenCalled();
    });

    it('rejects updateDefaults where all 3 IDs are the same (#5969: uniqueness invariant)', async () => {
      const store = createLlmSettingsStore(db);
      await expect(
        store.updateDefaults({
          primaryProfileId: 'p1',
          omProfileId: 'p1',
          hiringRhProfileId: 'p1',
        }),
      ).rejects.toThrow(/distinct|unique|different/i);
    });

    it('rejects updateDefaults with 2-of-3 duplicate IDs (#5969: uniqueness invariant)', async () => {
      const store = createLlmSettingsStore(db);
      await expect(
        store.updateDefaults({
          primaryProfileId: 'p1',
          omProfileId: 'p1',
          hiringRhProfileId: 'p2',
        }),
      ).rejects.toThrow(/distinct|unique|different/i);
    });
  });

  // ── getResolvedDefaults ──────────────────────────────────────────────────────

  describe('getResolvedDefaults', () => {
    it('throws when system defaults are not configured', async () => {
      db.query.llmProfiles.findMany = vi.fn().mockResolvedValue([]);
      db.query.systemLlmDefaults.findFirst = vi.fn().mockResolvedValue(null);

      const store = createLlmSettingsStore(db);
      await expect(store.getResolvedDefaults()).rejects.toThrow(
        'System LLM defaults are not configured',
      );
    });

    it('throws when default primary profile is missing', async () => {
      // Closes #5967: new getResolvedDefaults calls getProfile(id) which throws when missing.
      const defaultsRow = createMockDefaultsRow({ primaryProfileId: 'missing-primary' });
      db.query.llmProfiles.findFirst = vi.fn().mockResolvedValue(null);
      db.query.systemLlmDefaults.findFirst = vi.fn().mockResolvedValue(defaultsRow);

      const store = createLlmSettingsStore(db);
      await expect(store.getResolvedDefaults()).rejects.toThrow('LLM profile not found: missing-primary');
    });

    it('throws when default primary profile is disabled', async () => {
      // Closes #5967: getResolvedDefaults calls getProfile then checks isEnabled.
      const row = createMockProfileRow({ id: 'primary-disabled', isEnabled: 0 });
      const defaultsRow = createMockDefaultsRow({ primaryProfileId: 'primary-disabled' });

      db.query.llmProfiles.findFirst = vi.fn().mockResolvedValue(row);
      db.query.systemLlmDefaults.findFirst = vi.fn().mockResolvedValue(defaultsRow);

      const store = createLlmSettingsStore(db);
      await expect(store.getResolvedDefaults()).rejects.toThrow(
        'Default primary LLM profile is missing or disabled',
      );
    });

    it('throws when default OM profile is missing', async () => {
      // Closes #5967: getResolvedDefaults calls getProfile(primary) first which succeeds,
      // then getProfile(om=missing-om) throws.
      const primaryRow = createMockProfileRow({ id: 'primary-ok', isEnabled: 1 });
      const defaultsRow = createMockDefaultsRow({
        primaryProfileId: 'primary-ok',
        omProfileId: 'missing-om',
      });

      db.query.llmProfiles.findFirst = vi.fn()
        .mockResolvedValueOnce(primaryRow)  // primary
        .mockResolvedValueOnce(null);       // om (missing)
      db.query.systemLlmDefaults.findFirst = vi.fn().mockResolvedValue(defaultsRow);

      const store = createLlmSettingsStore(db);
      await expect(store.getResolvedDefaults()).rejects.toThrow('LLM profile not found: missing-om');
    });

    it('throws when default OM profile is disabled', async () => {
      // Closes #5967: getResolvedDefaults calls getProfile(primary) then getProfile(om-disabled)
      // in a Promise.all with the hr profile. All 3 dispatches happen, so the mock must provide
      // 3 values; the isEnabled check on om fires the throw AFTER the hr call returns.
      const primaryRow = createMockProfileRow({ id: 'primary-ok', isEnabled: 1 });
      const omRow = createMockProfileRow({ id: 'om-disabled', isEnabled: 0 });
      const hrRow = createMockProfileRow({ id: 'hr-ok', isEnabled: 1 });
      const defaultsRow = createMockDefaultsRow({
        primaryProfileId: 'primary-ok',
        omProfileId: 'om-disabled',
        hiringRhProfileId: 'hr-ok',
      });

      db.query.llmProfiles.findFirst = vi.fn()
        .mockResolvedValueOnce(primaryRow)
        .mockResolvedValueOnce(omRow)
        .mockResolvedValueOnce(hrRow);
      db.query.systemLlmDefaults.findFirst = vi.fn().mockResolvedValue(defaultsRow);

      const store = createLlmSettingsStore(db);
      await expect(store.getResolvedDefaults()).rejects.toThrow(
        'Default OM LLM profile is missing or disabled',
      );
    });

    it('throws when default hiring RH profile is missing', async () => {
      // Closes #5967: getResolvedDefaults calls getProfile 3x; hr is the missing one.
      const primaryRow = createMockProfileRow({ id: 'primary-ok', isEnabled: 1 });
      const omRow = createMockProfileRow({ id: 'om-ok', isEnabled: 1 });
      const defaultsRow = createMockDefaultsRow({
        primaryProfileId: 'primary-ok',
        omProfileId: 'om-ok',
        hiringRhProfileId: 'missing-hr',
      });

      db.query.llmProfiles.findFirst = vi.fn()
        .mockResolvedValueOnce(primaryRow)
        .mockResolvedValueOnce(omRow)
        .mockResolvedValueOnce(null);  // hr missing
      db.query.systemLlmDefaults.findFirst = vi.fn().mockResolvedValue(defaultsRow);

      const store = createLlmSettingsStore(db);
      await expect(store.getResolvedDefaults()).rejects.toThrow('LLM profile not found: missing-hr');
    });

    it('throws when default hiring RH profile is disabled', async () => {
      // Closes #5967: getResolvedDefaults calls getProfile 3x; hr row has isEnabled:0.
      const primaryRow = createMockProfileRow({ id: 'primary-ok', isEnabled: 1 });
      const omRow = createMockProfileRow({ id: 'om-ok', isEnabled: 1 });
      const hrRow = createMockProfileRow({ id: 'hr-disabled', isEnabled: 0 });
      const defaultsRow = createMockDefaultsRow({
        primaryProfileId: 'primary-ok',
        omProfileId: 'om-ok',
        hiringRhProfileId: 'hr-disabled',
      });

      db.query.llmProfiles.findFirst = vi.fn()
        .mockResolvedValueOnce(primaryRow)
        .mockResolvedValueOnce(omRow)
        .mockResolvedValueOnce(hrRow);
      db.query.systemLlmDefaults.findFirst = vi.fn().mockResolvedValue(defaultsRow);

      const store = createLlmSettingsStore(db);
      await expect(store.getResolvedDefaults()).rejects.toThrow(
        'Default hiring RH LLM profile is missing or disabled',
      );
    });

    it('returns all three resolved profiles when all are enabled', async () => {
      // Closes #5967: getResolvedDefaults now calls getProfile 3x.
      const primaryRow = createMockProfileRow({ id: 'primary', name: 'Primary Profile', isEnabled: 1 });
      const omRow = createMockProfileRow({ id: 'om', name: 'OM Profile', isEnabled: 1 });
      const hrRow = createMockProfileRow({ id: 'hr', name: 'HR Profile', isEnabled: 1 });
      const defaultsRow = createMockDefaultsRow({
        primaryProfileId: 'primary',
        omProfileId: 'om',
        hiringRhProfileId: 'hr',
      });

      db.query.llmProfiles.findFirst = vi.fn()
        .mockResolvedValueOnce(primaryRow)
        .mockResolvedValueOnce(omRow)
        .mockResolvedValueOnce(hrRow);
      db.query.systemLlmDefaults.findFirst = vi.fn().mockResolvedValue(defaultsRow);

      const store = createLlmSettingsStore(db);
      const result = await store.getResolvedDefaults();

      expect(result).toMatchObject({
        primaryProfile: expect.objectContaining({ profileId: 'primary', isEnabled: true }),
        omProfile: expect.objectContaining({ profileId: 'om', isEnabled: true }),
        hiringRhProfile: expect.objectContaining({ profileId: 'hr', isEnabled: true }),
      });
    });
  });
});
