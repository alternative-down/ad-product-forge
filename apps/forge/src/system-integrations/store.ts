import { SystemIntegrationsUnknownProviderTypeError } from './store.errors';
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

type SystemIntegrationProviderType = 'migadu' | 'coolify' | 'github' | 'minimax';

export type SystemIntegrationSummary = {
  id: string;
  providerType: SystemIntegrationProviderType;
  isEnabled: boolean;
  config: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

// L#NN-50 #35 helper: provider to typed config mapping for generic getConfigByProvider<T>
// (DRY: previously 4 callsites cast to specific config type via as <Type> | null).
type ConfigFor<T extends SystemIntegrationProviderType> = T extends 'migadu'
  ? MigaduSystemIntegrationConfig
  : T extends 'coolify'
    ? CoolifySystemIntegrationConfig
    : T extends 'github'
      ? GitHubSystemIntegrationConfig
      : T extends 'minimax'
        ? MinimaxSystemIntegrationConfig
        : never;

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
   * Boundary helper: maps a raw DB row to a typed Summary.
   *
   * Closes #6133 L#NN-50 #18 v2 atomic cast removal + L#NN-50 #35 structural-typing helper.
   * The DB row has integer timestamps + providerType as PK; Summary uses
   * Date timestamps + has an explicit id field (set to providerType since it
   * IS the primary key). Closes the 34-day-old Day 24 candidate self-documented
   * issue by typing the boundary instead of casting.
   */
  function mapDbRowToSummary(
    row: SystemIntegration & { providerType: SystemIntegrationProviderType },
  ): SystemIntegrationSummary {
    return {
      id: row.providerType,
      providerType: row.providerType,
      isEnabled: row.isEnabled === 1,
      config: null, // list path does not decrypt; see get*Config() for full
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  /**
   * Single dispatcher for fetching + parsing the enabled config for a provider.
   * Returns null when the integration is missing or disabled.
   * Used by `getMigaduConfig` / `getCoolifyConfig` / `getGitHubConfig` / `getMinimaxConfig`
   * (kept as thin back-compat wrappers).
   */
  async function getConfigByProvider<T extends SystemIntegrationProviderType>(
    providerType: T,
  ): Promise<ConfigFor<T> | null> {
    return await withDbErrorLogging({
      scope: 'system-integrations',
      op: `getConfig.${providerType}`,
      verb: 'read',
      fn: async () => {
        const row = await getEnabledIntegration(providerType);
        return row != null
          ? (parseConfigByProvider(providerType, row.encryptedConfig) as ConfigFor<T>)
          : null;
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

        // Closes #6133 L#NN-50 #18 v2 + #35: typed helper instead of as unknown as cast.
        // Primary key (providerType) maps to Summary.id; DB uses integer timestamps,
        // Summary uses Date — converted at the boundary by mapDbRowToSummary.
        return rows.filter(isKnownProvider).map(mapDbRowToSummary);
      },
    });
  }

  async function getMigaduConfig(): Promise<MigaduSystemIntegrationConfig | null> {
    return await getConfigByProvider('migadu');
  }

  async function getCoolifyConfig(): Promise<CoolifySystemIntegrationConfig | null> {
    return await getConfigByProvider('coolify');
  }

  async function getGitHubConfig(): Promise<GitHubSystemIntegrationConfig | null> {
    return await getConfigByProvider('github');
  }

  async function getMinimaxConfig(): Promise<MinimaxSystemIntegrationConfig | null> {
    return await getConfigByProvider('minimax');
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
        await db
          .delete(systemIntegrations)
          .where(eq(systemIntegrations.providerType, providerType));
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
      throw new SystemIntegrationsUnknownProviderTypeError();
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
