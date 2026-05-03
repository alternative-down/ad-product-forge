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
import { agents } from '../../database/schema';
import type { Database } from '../../database/index';

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
    const capabilityPermissions = await Promise.all(
      roles.map(async (role) => ({
        roleId: role.roleId,
        capabilityIds: await capabilities.listGrantedRoleCapabilities(role.roleId),
      })),
    );
    const assignedAgentCountByRoleId = new Map(
      agentCounts
        .filter((row) => row.roleId)
        .map((row) => [row.roleId as string, row.count]),
    );
    const capabilityMap = new Map(capabilityPermissions.map((row) => [row.roleId, row.capabilityIds]));

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
  }

  async function listSystemIntegrations() {
    return integrations.listIntegrations();
  }

  async function getSystemLlm() {
    const [profiles, defaults, prices] = await Promise.all([
      llmSettings.listProfiles(),
      llmSettings.getDefaults(),
      llmModelPrices.listPrices(),
    ]);

    return { profiles, defaults, prices };
  }

  async function getSystemSettings() {
    return systemSettings.getSettings();
  }

  async function getApplicationMigrations() {
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
  }

  return {
    listRoles,
    listSystemIntegrations,
    getSystemLlm,
    getSystemSettings,
    getApplicationMigrations,
  };
}
