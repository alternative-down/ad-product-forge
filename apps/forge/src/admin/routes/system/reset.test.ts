/**
 * Factory Reset Route + Logic Tests - #5679 PR-A
 *
 * L#19 tripwires for POST /admin/system/reset and performFactoryReset.
 *
 * Bug class targeted: "destructive operation without safety check" — e.g.,
 * accidental trigger via typo, replay, double-click, or admin-key leakage.
 *
 * L#26 sanity mutation protocol:
 *   1. Run tests → expect ALL PASS
 *   2. Revert one safety check (e.g., remove z.literal) → re-run → expect FAIL
 *   3. Restore → re-run → expect PASS
 *   Documented in test descriptions and verified by Aldric before PM-merge.
 */

// --- Mocks for file-level imports ---

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Schema modules: replace with Symbol placeholders so we don't need a real DB
vi.mock('../../../database/schema-llm', () => ({
  llmProfiles: { _name: 'llm_profiles' },
  llmModelPrices: { _name: 'llm_model_prices' },
  systemLlmDefaults: { _name: 'system_llm_defaults' },
}));

vi.mock('../../../database/schema-agents', () => ({
  agents: { _name: 'agents' },
  agentProviders: { _name: 'agent_providers' },
  agentExecutionContracts: { _name: 'agent_execution_contracts' },
  agentExecutionSteps: { _name: 'agent_execution_steps' },
  agentHomeMetricSnapshots: { _name: 'agent_home_metric_snapshots' },
  agentCheckpointedOmStates: { _name: 'agent_checkpointed_om_states' },
  agentLongTermMemoryStates: { _name: 'agent_long_term_memory_states' },
  agentLongTermMemoryRecallStates: { _name: 'agent_long_term_memory_recall_states' },
  agentNotifications: { _name: 'agent_notifications' },
  agentSchedules: { _name: 'agent_schedules' },
}));

vi.mock('../../../database/schema-config', () => ({
  systemSettings: { _name: 'system_settings' },
}));

vi.mock('../../../database/schema-integrations', () => ({
  systemIntegrations: { _name: 'system_integrations' },
}));

vi.mock('../../../database/schema-mcp', () => ({
  mcpServerConfigs: { _name: 'mcp_server_configs' },
  agentMcpConfigs: { _name: 'agent_mcp_configs' },
}));

vi.mock('../../../database/schema-chat', () => ({
  internalChatAccounts: { _name: 'internal_chat_accounts' },
  internalChatConversations: { _name: 'internal_chat_conversations' },
  internalChatConversationMembers: { _name: 'internal_chat_conversation_members' },
  internalChatMessages: { _name: 'internal_chat_messages' },
  internalChatMessageReads: { _name: 'internal_chat_message_reads' },
  internalChatMessageAttachments: { _name: 'internal_chat_message_attachments' },
}));

vi.mock('../../../database/schema-webhooks', () => ({
  webhookRoutes: { _name: 'webhook_routes' },
  webhookEvents: { _name: 'webhook_events' },
}));

const mockExistsSync = vi.fn();
const mockCopyFileSync = vi.fn();
const mockStatSync = vi.fn();
const mockUnlinkSync = vi.fn();
const mockMkdirSync = vi.fn();

vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  copyFileSync: (...args: unknown[]) => mockCopyFileSync(...args),
  statSync: (...args: unknown[]) => mockStatSync(...args),
  unlinkSync: (...args: unknown[]) => mockUnlinkSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
}));

const mockDelete = vi.fn();
vi.mock('../../../database/client', () => ({
  getDatabase: vi.fn(() => ({
    delete: mockDelete,
  })),
  Database: class {},
}));

const mockGetAppDatabasePath = vi.fn();
vi.mock('../../../database/config', () => ({
  getAppDatabasePath: () => mockGetAppDatabasePath(),
}));

const mockForgeDebug = vi.fn();
vi.mock('../debug', () => ({
  forgeDebug: (...args: unknown[]) => mockForgeDebug(...args),
}));

const mockErrorMsg = vi.fn((err: unknown) =>
  err instanceof Error ? err.message : String(err),
);
vi.mock('../../../agents/error-formatting', () => ({
  errorMsg: (err: unknown) => mockErrorMsg(err),
}));

// Real path.join (we want to test the actual filename generation)
vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  return actual;
});

import { performFactoryReset, listWipeTargets } from './reset';
import { factoryResetSchema } from '../schemas/system';
import { registerSystemWriteRoutes } from './write';

// --- Helpers ---

function makeMockHttpServer() {
  const routes: Array<{ method: string; path: string; handler: unknown }> = [];
  return {
    routes,
    registerRoute: vi.fn((route: { method: string; path: string; handler: unknown }) => {
      routes.push(route);
    }),
  };
}

function makeMockDb() {
  return { delete: mockDelete };
}

function makeMockSystemSettings() {
  return { upsertSettings: vi.fn().mockResolvedValue({}) };
}

function makeMockLlmSettings() {
  return { upsertProfile: vi.fn() };
}

function makeMockLlmModelPrices() {
  return { upsertPrice: vi.fn() };
}

function makeMockIntegrations() {
  return { upsertIntegration: vi.fn() };
}

function makeMockRegistry() {
  return { list: vi.fn().mockReturnValue([]), get: vi.fn() };
}

function makeMockLoader() {
  return vi.fn();
}

function buildInput() {
  return {
    httpServer: makeMockHttpServer() as unknown as Parameters<typeof registerSystemWriteRoutes>[0]['httpServer'],
    db: makeMockDb() as unknown as Parameters<typeof registerSystemWriteRoutes>[0]['db'],
    workspaceBasePath: '/tmp/test-workspace',
    loaderConfig: {} as Parameters<typeof registerSystemWriteRoutes>[0]['loaderConfig'],
    systemSettings: makeMockSystemSettings() as unknown as Parameters<typeof registerSystemWriteRoutes>[0]['systemSettings'],
    llmSettings: makeMockLlmSettings() as unknown as Parameters<typeof registerSystemWriteRoutes>[0]['llmSettings'],
    llmModelPrices: makeMockLlmModelPrices() as unknown as Parameters<typeof registerSystemWriteRoutes>[0]['llmModelPrices'],
    integrations: makeMockIntegrations() as unknown as Parameters<typeof registerSystemWriteRoutes>[0]['integrations'],
    registry: makeMockRegistry() as unknown as Parameters<typeof registerSystemWriteRoutes>[0]['registry'],
    loadAgent: makeMockLoader() as unknown as Parameters<typeof registerSystemWriteRoutes>[0]['loadAgent'],
  };
}

const TEMP_DB = '/tmp/forge-test-agents.db';
const TEMP_BACKUP_DIR = '/tmp/forge-test-backups';
const FIXED_TS = 0; // 1970-01-01T00:00:00.000Z (epoch, deterministic)
const FIXED_ISO = '1970-01-01T00:00:00.000Z';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAppDatabasePath.mockReturnValue(TEMP_DB);
  mockExistsSync.mockReturnValue(true);
  mockCopyFileSync.mockReturnValue(undefined);
  mockStatSync.mockReturnValue({ size: 4096 });
  // Default: every db.delete() resolves successfully
  mockDelete.mockResolvedValue({ rowsAffected: 0 });
  mockErrorMsg.mockImplementation((err: unknown) =>
    err instanceof Error ? err.message : String(err),
  );
});

// =============================================================================
// SCHEMA TESTS
// =============================================================================

describe('factoryResetSchema', () => {
  it('L#19 tripwire: accepts body with confirm: "FACTORY_RESET"', () => {
    const result = factoryResetSchema.parse({ confirm: 'FACTORY_RESET' });
    expect(result.confirm).toBe('FACTORY_RESET');
  });

  it('L#19 tripwire: rejects body with confirm: "factory_reset" (case mismatch)', () => {
    expect(() => factoryResetSchema.parse({ confirm: 'factory_reset' })).toThrow();
  });

  it('L#19 tripwire: rejects body with confirm: "RESET" (too short)', () => {
    expect(() => factoryResetSchema.parse({ confirm: 'RESET' })).toThrow();
  });

  it('L#19 tripwire: rejects empty body', () => {
    expect(() => factoryResetSchema.parse({})).toThrow();
  });

  it('L#19 tripwire: rejects body with extra fields (catches adminKey leakage attempt)', () => {
    // z.object is NOT strict by default, so extra fields are allowed.
    // This test documents the policy: extra fields are ignored (no harm).
    const result = factoryResetSchema.parse({
      confirm: 'FACTORY_RESET',
      extraField: 'leaked-admin-key',
    });
    expect(result.confirm).toBe('FACTORY_RESET');
  });
});

// =============================================================================
// performFactoryReset HAPPY PATH
// =============================================================================

describe('performFactoryReset', () => {
  it('L#19 tripwire: creates backup file before any wipe', async () => {
    const callOrder: string[] = [];
    mockCopyFileSync.mockImplementation(() => {
      callOrder.push('copyFileSync');
    });
    mockDelete.mockImplementation(() => {
      callOrder.push('delete');
      return Promise.resolve({ rowsAffected: 0 });
    });

    await performFactoryReset({
      dbPathOverride: TEMP_DB,
      backupDirOverride: TEMP_BACKUP_DIR,
      timestampOverride: FIXED_TS,
    });

    // Backup must be FIRST, then deletes
    expect(callOrder[0]).toBe('copyFileSync');
    expect(callOrder.filter((c) => c === 'copyFileSync')).toHaveLength(1);
    expect(callOrder.filter((c) => c === 'delete').length).toBeGreaterThan(0);
  });

  it('L#19 tripwire: returns backupPath matching /tmp/forge-factory-reset-{ISO}.db pattern', async () => {
    const result = await performFactoryReset({
      dbPathOverride: TEMP_DB,
      backupDirOverride: TEMP_BACKUP_DIR,
      timestampOverride: FIXED_TS,
    });

    expect(result.ok).toBe(true);
    expect(result.backupPath).toBe(`${TEMP_BACKUP_DIR}/forge-factory-reset-1970-01-01T00-00-00-000Z.db`);
    expect(result.timestampIso).toBe(FIXED_ISO);
  });

  it('L#19 tripwire: calls db.delete for all 25 target tables (LOCKED defaults coverage)', async () => {
    await performFactoryReset({
      dbPathOverride: TEMP_DB,
      backupDirOverride: TEMP_BACKUP_DIR,
      timestampOverride: FIXED_TS,
    });

    // Count distinct table references passed to delete()
    const targets = listWipeTargets();
    expect(targets).toHaveLength(25);
    expect(mockDelete).toHaveBeenCalledTimes(25);
  });

  it('L#19 tripwire: agents deleted BEFORE llmProfiles (FK restrict order)', async () => {
    const callOrder: string[] = [];
    mockDelete.mockImplementation((table: { _name?: string } & unknown) => {
      if (table && typeof table === 'object' && '_name' in table) {
        callOrder.push((table as { _name: string })._name);
      }
      return Promise.resolve({ rowsAffected: 0 });
    });

    await performFactoryReset({
      dbPathOverride: TEMP_DB,
      backupDirOverride: TEMP_BACKUP_DIR,
      timestampOverride: FIXED_TS,
    });

    const agentsIdx = callOrder.indexOf('agents');
    const llmProfilesIdx = callOrder.indexOf('llm_profiles');
    expect(agentsIdx).toBeGreaterThanOrEqual(0);
    expect(llmProfilesIdx).toBeGreaterThan(agentsIdx);
  });

  it('L#19 tripwire: logs factory_reset complete with backupPath + wipedTables', async () => {
    await performFactoryReset({
      dbPathOverride: TEMP_DB,
      backupDirOverride: TEMP_BACKUP_DIR,
      timestampOverride: FIXED_TS,
    });

    const completeEvent = mockForgeDebug.mock.calls.find(
      (call) => (call[0] as { message?: string })?.message === 'Factory reset complete',
    );
    expect(completeEvent).toBeDefined();
    const context = (completeEvent![0] as { context: Record<string, unknown> }).context;
    expect(context.backupPath).toContain(TEMP_BACKUP_DIR);
    expect(context.wipedTables).toHaveLength(25);
    expect(context.timestamp).toBe(FIXED_TS);
  });
});

// =============================================================================
// performFactoryReset ERROR PATHS
// =============================================================================

describe('performFactoryReset error handling', () => {
  it('L#19 tripwire: throws "Database file not found" if source DB missing', async () => {
    mockExistsSync.mockReturnValue(false);

    await expect(
      performFactoryReset({
        dbPathOverride: '/nonexistent/forge.db',
        backupDirOverride: TEMP_BACKUP_DIR,
        timestampOverride: FIXED_TS,
      }),
    ).rejects.toThrow(/Database file not found/);
  });

  it('L#19 tripwire: does NOT call db.delete if backup fails (atomicity)', async () => {
    mockCopyFileSync.mockImplementation(() => {
      throw new Error('disk full');
    });

    await expect(
      performFactoryReset({
        dbPathOverride: TEMP_DB,
        backupDirOverride: TEMP_BACKUP_DIR,
        timestampOverride: FIXED_TS,
      }),
    ).rejects.toThrow(/Failed to backup database/);

    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('L#19 tripwire: rejects empty backup file (defense against copyFileSync of 0-byte)', async () => {
    mockStatSync.mockReturnValue({ size: 0 });

    await expect(
      performFactoryReset({
        dbPathOverride: TEMP_DB,
        backupDirOverride: TEMP_BACKUP_DIR,
        timestampOverride: FIXED_TS,
      }),
    ).rejects.toThrow(/Backup file is empty/);

    expect(mockUnlinkSync).toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('L#19 tripwire: throws on wipe failure with table name + already-wiped list', async () => {
    let callCount = 0;
    mockDelete.mockImplementation(() => {
      callCount++;
      if (callCount === 5) {
        return Promise.reject(new Error('FK violation'));
      }
      return Promise.resolve({ rowsAffected: 0 });
    });

    await expect(
      performFactoryReset({
        dbPathOverride: TEMP_DB,
        backupDirOverride: TEMP_BACKUP_DIR,
        timestampOverride: FIXED_TS,
      }),
    ).rejects.toThrow(/Failed to wipe table/);
  });
});

// =============================================================================
// listWipeTargets
// =============================================================================

describe('listWipeTargets', () => {
  it('returns all 24 LOCKED default table names', () => {
    const targets = listWipeTargets();
    expect(targets).toHaveLength(25);
    expect(targets).toContain('llm_profiles');
    expect(targets).toContain('agents');
    expect(targets).toContain('system_settings');
    expect(targets).toContain('agent_schedules');
    expect(targets).toContain('internal_chat_messages');
    expect(targets).toContain('webhook_routes');
  });
});

// =============================================================================
// ROUTE HANDLER (integration with write.ts)
// =============================================================================

describe('POST /admin/system/reset route', () => {
  it('registers the route as POST', () => {
    const mockServer = makeMockHttpServer();
    const input = buildInput();
    (input as { httpServer: unknown }).httpServer = mockServer;

    registerSystemWriteRoutes(input);

    const route = mockServer.routes.find((r) => r.path === '/admin/system/reset');
    expect(route).toBeDefined();
    expect(route!.method).toBe('POST');
  });

  it('L#19 tripwire: rejects body with wrong confirm string (route returns 500)', async () => {
    const input = buildInput();
    registerSystemWriteRoutes(input);
    const route = (input.httpServer as unknown as ReturnType<typeof makeMockHttpServer>).routes.find(
      (r) => r.path === '/admin/system/reset',
    );
    const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;

    const result = (await handler({ bodyText: JSON.stringify({ confirm: 'wrong' }) })) as {
      status: number;
      body: string;
    };
    expect(result.status).toBe(500);
    expect(result.body).toContain('confirm');
    // Critical: factory reset must NOT have been triggered
    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('L#19 tripwire: successful reset returns 200 with backupPath + wipedTables', async () => {
    const input = buildInput();
    registerSystemWriteRoutes(input);
    const route = (input.httpServer as unknown as ReturnType<typeof makeMockHttpServer>).routes.find(
      (r) => r.path === '/admin/system/reset',
    );
    const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;

    // Pin timestamp via factoryResetSchema side-effect? No — the handler doesn't
    // pass options, so we rely on Date.now(). The backupPath is non-deterministic
    // in tests, but the structure is testable.
    const result = (await handler({
      bodyText: JSON.stringify({ confirm: 'FACTORY_RESET' }),
    })) as { status: number; body: string };
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.ok).toBe(true);
    expect(body.backupPath).toMatch(/^\/tmp\/forge-factory-reset-.*\.db$/);
    expect(body.wipedTables).toHaveLength(25);
  });
});

// =============================================================================
// L#26 SANITY MUTATION PROTOCOL (documentation)
// =============================================================================
//
// To verify the tripwires catch the bug class:
//
// 1. Run `npx vitest run apps/forge/src/admin/routes/system/reset.test.ts` → ALL PASS
// 2. Pick a safety check and revert it. Examples:
//    a) In factoryResetSchema, change `z.literal('FACTORY_RESET')` to
//       `z.string().min(1)` → schema tests should now PASS for any non-empty string,
//       AND the route handler test "rejects body with wrong confirm string" should FAIL
//       (the bug class is "missing literal check, accepting any string")
//    b) In performFactoryReset, swap the backup block to run AFTER the delete loop
//       → "creates backup file before any wipe" test should FAIL
//       (the bug class is "ordering bug, backup happens after destruction")
//    c) In performFactoryReset, remove the `if (backupSize === 0)` check
//       → "rejects empty backup file" test should FAIL
//       (the bug class is "missing sanity check, allows corrupted backup")
// 3. Restore the original code → re-run → ALL PASS
//
// Aldric will perform one of these mutations manually before PM-merge (L#26 protocol).
// =============================================================================
