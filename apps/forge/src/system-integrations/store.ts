import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '../database/client';
import { withDbErrorLogging } from '../database/error-logging';
import type {
  CoolifySystemIntegrationConfig,
  GitHubSystemIntegrationConfig,
  MigaduSystemIntegrationConfig,
  MinimaxSystemIntegrationConfig,
} from '../database/schema';
import { systemIntegrations } from '../database/schema';
import type { SystemIntegration } from '../database/schema';
import { forgeDebug } from '@forge-runtime/core';
import { decryptSecret, encryptSecret } from '../encryption/crypto';

const migaduConfigSchema = z.object({
  apiUser: z.string().email(),
  apiKey: z.string().min(1),
});

const coolifyConfigSchema = z.object({
  baseUrl: z.string().url(),
  adminToken: z.string().min(1),
  serverId: z.string().min(1),
  destinationId: z.string().min(1),
  applicationsBaseDomain: z.string().min(1).optional(),
});

const githubConfigSchema = z.object({
  organization: z.string().min(1),
  appHomeUrl: z.string().url(),
});

const minimaxConfigSchema = z.object({
  apiKey: z.string().min(1),
});

export type SystemIntegrationProviderType = 'migadu' | 'coolify' | 'github' | 'minimax';

export type SystemIntegrationSummary = {
  id: string;
  providerType: SystemIntegrationProviderType;
  isEnabled: boolean;
  config: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Fields that must not appear in list/summary API responses */
export type SystemIntegrationStore = Awaited<ReturnType<typeof createSystemIntegrationStore>>;
export function createSystemIntegrationStore(db: Database) {
  const parseConfigSchemaMap: Record<SystemIntegrationProviderType, z.ZodType<unknown>> = {
    migadu: migaduConfigSchema,
    coolify: coolifyConfigSchema,
    github: githubConfigSchema,
    minimax: minimaxConfigSchema,
  };

  /**
   * Type predicate: narrows a raw DB row to a row whose `providerType` is one of
   * the 4 known provider types. Used by `listIntegrations` to drop legacy/invalid
   * rows without an unsafe cast.
   */
  function isKnownProvider(
    row: SystemIntegration,
  ): row is SystemIntegration & { providerType: SystemIntegrationProviderType } {
    return (
      row.providerType === 'migadu' ||
      row.providerType === 'coolify' ||
      row.providerType === 'github' ||
      row.providerType === 'minimax'
    );
  }

  /**
   * Single dispatcher for parsing encrypted configs by provider type.
   * Replaces the 4 parseXConfig wrappers (Closes #5982 DRY violation).
   */
  function parseConfigByProvider(
    providerType: SystemIntegrationProviderType,
    encryptedConfig: string,
  ): unknown {
    return parseConfigSchemaMap[providerType].parse(JSON.parse(decryptSecret(encryptedConfig)));
  }

  /**
   * Single dispatcher for fetching + parsing the enabled config for a provider.
   * Returns null when the integration is missing or disabled.
   * Used by `getMigaduConfig` / `getCoolifyConfig` / `getGitHubConfig` / `getMinimaxConfig`
   * (kept as thin back-compat wrappers).
   */
  async function getConfigByProvider(
    providerType: SystemIntegrationProviderType,
  ): Promise<unknown> {
    return await withDbErrorLogging({
      scope: 'system-integrations',
      op: `getConfig.${providerType}`,
      verb: 'read',
      fn: async () => {
        const row = await getEnabledIntegration(providerType);
        return row != null ? parseConfigByProvider(providerType, row.encryptedConfig) : null;
      },
    });
  }

  // Closes #5981: listIntegrations MUST NOT decrypt credentials. Returns
  // metadata only. Callers that need the full config must call
  // getMigaduConfig() / getCoolifyConfig() / getGithubConfig() / getMinimaxConfig()
  // explicitly.
  async function listIntegrations(): Promise<SystemIntegrationSummary[]> {
    return await withDbErrorLogging({
      scope: 'system-integrations',
      op: 'listIntegrations',
      verb: 'read',
      fn: async () => {
        const rows = await db.query.systemIntegrations.findMany();

        // Structural mismatch: row has number timestamps + no id; Summary
        // expects Date timestamps + id. Typed boundary cast is honest about
        // the gap (vs Varek prior as any). Day 24 candidate: align Summary type with schema.
        return rows.filter(isKnownProvider).map((row) => {
          const { encryptedConfig, ...rest } = row;
          void encryptedConfig; // intentionally not decrypted in list path
          return {
            ...rest,
            isEnabled: row.isEnabled === 1,
            config: null, // list path does not decrypt; see get*Config() for full
          };
        }) as unknown as SystemIntegrationSummary[];
      },
    });
  }

  async function getMigaduConfig(): Promise<MigaduSystemIntegrationConfig | null> {
    return (await getConfigByProvider('migadu')) as MigaduSystemIntegrationConfig | null;
  }

  async function getCoolifyConfig(): Promise<CoolifySystemIntegrationConfig | null> {
    return (await getConfigByProvider('coolify')) as CoolifySystemIntegrationConfig | null;
  }

  async function getGitHubConfig(): Promise<GitHubSystemIntegrationConfig | null> {
    return (await getConfigByProvider('github')) as GitHubSystemIntegrationConfig | null;
  }

  async function getMinimaxConfig(): Promise<MinimaxSystemIntegrationConfig | null> {
    return (await getConfigByProvider('minimax')) as MinimaxSystemIntegrationConfig | null;
  }

  async function upsertIntegration(
    input:
      | {
          providerType: 'migadu';
          config: MigaduSystemIntegrationConfig;
          isEnabled?: boolean;
        }
      | {
          providerType: 'coolify';
          config: CoolifySystemIntegrationConfig;
          isEnabled?: boolean;
        }
      | {
          providerType: 'github';
          config: GitHubSystemIntegrationConfig;
          isEnabled?: boolean;
        }
      | {
          providerType: 'minimax';
          config: MinimaxSystemIntegrationConfig;
          isEnabled?: boolean;
        },
  ) {
    const parsedConfig = parseUpsertConfig(input.providerType, input.config);

    return await withDbErrorLogging({
      scope: 'system-integrations',
      op: 'upsertIntegration',
      verb: 'write',
      context: { providerType: input.providerType },
      fn: async () => {
        const now = Date.now();
        await db
          .insert(systemIntegrations)
          .values({
            providerType: input.providerType,
            encryptedConfig: encryptSecret(JSON.stringify(parsedConfig)),
            isEnabled: input.isEnabled === false ? 0 : 1,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: systemIntegrations.providerType,
            set: {
              encryptedConfig: encryptSecret(JSON.stringify(parsedConfig)),
              isEnabled: input.isEnabled === false ? 0 : 1,
              updatedAt: now,
            },
          });

        return {
          providerType: input.providerType,
          isEnabled: input.isEnabled ?? false,
          config: parsedConfig,
        };
      },
    });
  }

  async function deleteIntegration(providerType: SystemIntegrationProviderType) {
    return await withDbErrorLogging({
      scope: 'system-integrations',
      op: 'deleteIntegration',
      verb: 'write',
      context: { providerType },
      fn: async () => {
        await db.delete(systemIntegrations).where(eq(systemIntegrations.providerType, providerType));
      },
    });
  }

  async function getEnabledIntegration(providerType: SystemIntegrationProviderType) {
    const row = await db.query.systemIntegrations.findFirst({
      where: eq(systemIntegrations.providerType, providerType),
    });

    if (row === null || row === undefined || row.isEnabled !== 1) {
      return null;
    }

    return row;
  }

  function parseUpsertConfig(
    providerType: SystemIntegrationProviderType,
    config:
      | MigaduSystemIntegrationConfig
      | CoolifySystemIntegrationConfig
      | GitHubSystemIntegrationConfig
      | MinimaxSystemIntegrationConfig,
  ) {
    const schema = parseConfigSchemaMap[providerType];
    if (schema === null || schema === undefined) {
      forgeDebug({
        scope: 'system-integrations-store',
        level: 'error',
        message: 'system-integrations-store: validation/requirement failed',
      });
      throw new Error('Unknown integration provider type');
    }
    return schema.parse(config);
  }

  return {
    listIntegrations,
    getMigaduConfig,
    getCoolifyConfig,
    getGitHubConfig,
    getMinimaxConfig,
    upsertIntegration,
    deleteIntegration,
  };
}