/**
 * System Factory Reset - Phase 4+ of #719, #5679 PR-A
 *
 * Core logic for POST /admin/system/reset. Backs up the database file,
 * then wipes all user-data tables (LLM profiles, agents, system settings,
 * schedules, internal-chat, webhooks). Preserves schema (does NOT drop
 * tables) so the application can keep running post-reset.
 *
 * LOCKED defaults (Nicolas 20:57Z "Ok", Orion 20:58Z interpretation):
 *   - Wipe: LLM profiles + agent configs + system settings + schedules
 *     + internal-chat + webhooks
 *   - Preserve: schema (tables) + role definitions (out of scope)
 *   - Backup: /tmp/forge-factory-reset-{ISO_TIMESTAMP}.db BEFORE any wipe
 *   - Audit: forgeDebug log (level=info) with backupPath + wipedTables + timestamp
 *
 * L#NN-19 hygiene: no env var values are read or echoed. The admin API
 * key is enforced at the HTTP middleware level (x-forge-admin-api-key
 * header) — not by this module.
 *
 * L#NN-16 family awareness: this module relies on `getAppDatabasePath()`
 * which resolves via `process.env.FORGE_DATA_PATH`. If the runtime layout
 * changes (e.g., bundled vs dev), the path still works because it's
 * resolved at request time, not at module load.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { errorMsg } from '../../../agents/error-formatting';
import { getDatabase, type Database } from '../../../database/client';
import { getAppDatabasePath } from '../../../database/config';
import { llmProfiles, llmModelPrices, systemLlmDefaults } from '../../../database/schema-llm';
import {
  agents,
  agentProviders,
  agentExecutionContracts,
  agentExecutionSteps,
  agentHomeMetricSnapshots,
  agentCheckpointedOmStates,
  agentLongTermMemoryStates,
  agentLongTermMemoryRecallStates,
  agentNotifications,
  agentSchedules,
} from '../../../database/schema-agents';
import { systemSettings } from '../../../database/schema-config';
import { systemIntegrations } from '../../../database/schema-integrations';
import { mcpServerConfigs, agentMcpConfigs } from '../../../database/schema-mcp';
import {
  internalChatAccounts,
  internalChatConversations,
  internalChatConversationMembers,
  internalChatMessages,
  internalChatMessageReads,
  internalChatMessageAttachments,
} from '../../../database/schema-chat';
import { webhookRoutes, webhookEvents } from '../../../database/schema-webhooks';
import { forgeDebug } from '../debug';

export interface FactoryResetResult {
  ok: true;
  backupPath: string;
  wipedTables: string[];
  timestamp: number;
  timestampIso: string;
}

export interface FactoryResetOptions {
  /**
   * Override the database path. Defaults to `getAppDatabasePath()`.
   * Used by tests to point at a temp DB.
   */
  dbPathOverride?: string;
  /**
   * Override the backup directory. Defaults to `/tmp`.
   * Used by tests to keep /tmp clean.
   */
  backupDirOverride?: string;
  /**
   * Override the timestamp. Defaults to `Date.now()`.
   * Used by tests for deterministic filenames.
   */
  timestampOverride?: number;
}

type SqliteTable = Parameters<Database['delete']>[0];

/**
 * Wipe order matters because of foreign key constraints:
 * 1. Tables that reference llmProfiles or agents MUST be wiped first
 * 2. Then agents (FKs to llmProfiles with `onDelete: 'restrict'`)
 * 3. Then llmProfiles (no longer referenced)
 *
 * L#NN-16 sibling: if new tables are added with FKs to wiped tables,
 * they must be added to this array BEFORE the referenced table.
 */
const WIPE_ORDER: Array<{ name: string; table: SqliteTable }> = [
  // Agent-owned (FKs to agents, must come first)
  { name: 'agent_providers', table: agentProviders },
  { name: 'agent_execution_contracts', table: agentExecutionContracts },
  { name: 'agent_execution_steps', table: agentExecutionSteps },
  { name: 'agent_home_metric_snapshots', table: agentHomeMetricSnapshots },
  { name: 'agent_checkpointed_om_states', table: agentCheckpointedOmStates },
  { name: 'agent_long_term_memory_states', table: agentLongTermMemoryStates },
  { name: 'agent_long_term_memory_recall_states', table: agentLongTermMemoryRecallStates },
  { name: 'agent_notifications', table: agentNotifications },
  { name: 'agent_mcp_configs', table: agentMcpConfigs },
  { name: 'agent_schedules', table: agentSchedules },
  // Agents (FK to llmProfiles, restrict)
  { name: 'agents', table: agents },
  // LLM (no longer referenced after agents wiped)
  { name: 'llm_profiles', table: llmProfiles },
  { name: 'llm_model_prices', table: llmModelPrices },
  { name: 'system_llm_defaults', table: systemLlmDefaults },
  // MCP server configs (referenced by agent_mcp_configs via cascade — already gone)
  { name: 'mcp_server_configs', table: mcpServerConfigs },
  // System settings
  { name: 'system_settings', table: systemSettings },
  { name: 'system_integrations', table: systemIntegrations },
  // Internal chat
  { name: 'internal_chat_accounts', table: internalChatAccounts },
  { name: 'internal_chat_conversations', table: internalChatConversations },
  { name: 'internal_chat_conversation_members', table: internalChatConversationMembers },
  { name: 'internal_chat_messages', table: internalChatMessages },
  { name: 'internal_chat_message_reads', table: internalChatMessageReads },
  { name: 'internal_chat_message_attachments', table: internalChatMessageAttachments },
  // Webhooks
  { name: 'webhook_routes', table: webhookRoutes },
  { name: 'webhook_events', table: webhookEvents },
];

/**
 * Performs the factory reset: backup DB file, then wipe all user-data tables.
 *
 * @throws Error if the backup fails (wipe is NOT attempted)
 * @throws Error if any wipe step fails (DB may be partially wiped; backup still exists)
 */
export async function performFactoryReset(
  options: FactoryResetOptions = {},
): Promise<FactoryResetResult> {
  const dbPath = options.dbPathOverride ?? getAppDatabasePath();
  const backupDir = options.backupDirOverride ?? '/tmp';
  const timestamp = options.timestampOverride ?? Date.now();
  const timestampIso = new Date(timestamp).toISOString();
  const backupFilename = `forge-factory-reset-${timestampIso.replace(/[:.]/g, '-')}.db`;
  const backupPath = path.join(backupDir, backupFilename);

  // Step 1: Backup DB file BEFORE any wipe
  try {
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database file not found at ${dbPath}`);
    }
    fs.copyFileSync(dbPath, backupPath);
  } catch (err) {
    forgeDebug({
      scope: 'admin',
      level: 'error',
      message: 'Factory reset: DB backup failed',
      context: { error: errorMsg(err), dbPath, backupPath },
    });
    throw new Error(`Failed to backup database: ${errorMsg(err)}`);
  }

  // Verify backup is non-empty (defense against copyFileSync of empty file)
  const backupSize = fs.statSync(backupPath).size;
  if (backupSize === 0) {
    fs.unlinkSync(backupPath);
    throw new Error(`Backup file is empty (0 bytes): ${backupPath}`);
  }

  forgeDebug({
    scope: 'admin',
    level: 'info',
    message: 'Factory reset: DB backup created',
    context: { dbPath, backupPath, backupBytes: backupSize },
  });

  // Step 2: Wipe tables in order
  const db = getDatabase();
  const wipedTables: string[] = [];

  for (const { name, table } of WIPE_ORDER) {
    try {
      // Drizzle: db.delete(table) without .where() deletes all rows.
      // We intentionally do NOT use .where(eq(table.id, ...)) to wipe all.
      await db.delete(table);
      wipedTables.push(name);
    } catch (err) {
      forgeDebug({
        scope: 'admin',
        level: 'error',
        message: `Factory reset: failed to wipe table ${name}`,
        context: { error: errorMsg(err), table: name, alreadyWiped: wipedTables },
      });
      throw new Error(
        `Failed to wipe table ${name} (already wiped: ${wipedTables.join(', ')}): ${errorMsg(err)}`,
      );
    }
  }

  // Step 3: Audit log entry (forgeDebug level=info, structured)
  forgeDebug({
    scope: 'admin',
    level: 'info',
    message: 'Factory reset complete',
    context: {
      backupPath,
      backupBytes: backupSize,
      wipedTables,
      timestamp,
      timestampIso,
    },
  });

  return {
    ok: true,
    backupPath,
    wipedTables,
    timestamp,
    timestampIso,
  };
}

/**
 * Sanity check: lists the tables that would be wiped without actually wiping.
 * Useful for /admin/system/reset/dry-run endpoint (future PR) and for tests.
 */
export function listWipeTargets(): string[] {
  return WIPE_ORDER.map((entry) => entry.name);
}
