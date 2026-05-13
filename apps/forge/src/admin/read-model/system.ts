import { readFile } from 'node:fs/promises';
import 'node:process';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { createCapabilityStore } from '../../capabilities/store';
import { createSystemIntegrationStore } from '../../system-integrations/store';
import { createLlmSettingsStore } from '../../llm/settings-store';
import { createLlmModelPriceStore } from '../../llm/model-price-store';
import { createSystemSettingsStore } from '../../system-settings/store';
import { forgeCapabilityIds } from '../../capabilities/catalog';
import { forgeDebug } from '@forge-runtime/core';
import { agents } from '../../database/schema';

import type {Database} from '../../database/schema';

export interface SystemReadModel {
  listRoles: () => Promise<{
    availableCapabilityIds: readonly string[];
    items: Array<{
      roleId: string;
      name: string;
      description: string | null;
      assignedAgentCount: number;
      capabilityIds: string[];
      createdAt: Date;
      updatedAt: Date;
    }>;
  }>;
  listSystemIntegrations: () => Promise<ReturnType<ReturnType<typeof createSystemIntegrationStore>['listIntegrations']>>;
  getSystemLlm: () => Promise<{
    profiles: Awaited<ReturnType<ReturnType<typeof createLlmSettingsStore>['listProfiles']>>;
    defaults: Awaited<ReturnType<ReturnType<typeof createLlmSettingsStore>['getDefaults']>>;
    prices: Awaited<ReturnType<ReturnType<typeof createLlmModelPriceStore>['listPrices']>>;
  }>;
  // Fragmented LLM routes (#1588) — removed dead wrappers (no routes call these)
  getSystemSettings: () => Promise<ReturnType<ReturnType<typeof createSystemSettingsStore>['getSettings']>>;
  getApplicationMigrations: () => Promise<{
    applied: { id: number; hash: string; createdAt: number }[];
    entries: {
      idx: number;
      tag: string;
      createdAt: number;
      applied: boolean;
      hash: string | null;
      rowId: number | null;
    }[];
  }>;
}

export function createSystemReadModel(input: { db: Database }): SystemReadModel {
  const db = input.db;
  const capabilities = createCapabilityStore(db);
  const integrations = createSystemIntegrationStore(db);
  const llmSettings = createLlmSettingsStore(db);
  const llmModelPrices = createLlmModelPriceStore(db);
  const systemSettings = createSystemSettingsStore(db);

  async function listRoles() {
    try {
      const [roles, agentCounts] = await Promise.all([
        capabilities.listRoles(),
        db
          .select({
            roleId: agents.roleId,
            count: sql<number>`count(*)`,
          })
          .from(agents)
          .groupBy(agents.roleId).all(),
      ]);
      const assignedAgentCountByRoleId = new Map(
        agentCounts
          .filter((row) => row.roleId)
          .map((row) => [row.roleId as string, row.count]),
      );
      const capabilityMap = await capabilities.listGrantedRoleCapabilitiesBatch(
        roles.map((role) => role.roleId),
      );

      return {
        availableCapabilityIds: forgeCapabilityIds,
        items: roles.map((role) => ({
          roleId: role.roleId,
          name: role.name,
          description: role.description,
          assignedAgentCount: assignedAgentCountByRoleId.get(role.roleId) ?? 0,
          capabilityIds: capabilityMap.get(role.roleId) ?? [],
          createdAt: role.createdAt,
          updatedAt: role.updatedAt,
        })),
      };
    } catch (err) {
      forgeDebug({ scope: 'admin-readmodel-system', level: 'error', message: 'listRoles failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function listSystemIntegrations() {
    return await integrations.listIntegrations();
  }

  async function getSystemLlm() {
    try {
      const [profiles, defaults, prices] = await Promise.all([
        llmSettings.listProfiles(),
        llmSettings.getDefaults(),
        llmModelPrices.listPrices(),
      ]);

      return { profiles, defaults, prices };
    } catch (err) {
      forgeDebug({ scope: 'admin-readmodel-system', level: 'error', message: 'getSystemLlm failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function getSystemSettings() {
    return await systemSettings.getSettings();
  }

  async function getApplicationMigrations() {
    try {
      const journalPath = resolve(process.cwd(), 'migrations/meta/_journal.json');
      const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
        entries: Array<{
          idx: number;
          when: number;
          tag: string;
        }>;
      };
      const appliedRows = await db.all<{
        id: number;
        hash: string;
        createdAt: number;
      }>(sql`
        select
          id,
          hash,
          created_at as createdAt
        from __drizzle_migrations
        order by created_at asc
      `);
      const appliedByCreatedAt = new Map(appliedRows.map((row) => [Number(row.createdAt), row]));

      return {
        applied: appliedRows,
        entries: journal.entries.map((entry) => {
          const applied = appliedByCreatedAt.get(entry.when);

          return {
            idx: entry.idx,
            tag: entry.tag,
            createdAt: entry.when,
            applied: Boolean(applied),
            hash: applied?.hash ?? null,
            rowId: applied?.id ?? null,
          };
        }),
      };
    } catch (err) {
      forgeDebug({ scope: 'admin-readmodel-system', level: 'error', message: 'getApplicationMigrations failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  // ─── Fragmented LLM routes (#1588) — removed dead wrappers (no routes call these)
  return {
    listRoles,
    listSystemIntegrations,
    getSystemLlm,
    getSystemSettings,
    getApplicationMigrations,
  };
}
