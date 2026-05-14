import { eq } from 'drizzle-orm';
import { z } from 'zod';


import type {Database} from '../database/schema';
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
const SENSITIVE_FIELDS: Record<SystemIntegrationProviderType, string[]> = {
  migadu: ['apiKey'],
  coolify: ['adminToken'],
  github: [], // no raw secrets; appHomeUrl and organization are not secret
  minimax: ['apiKey'],
};

export function createSystemIntegrationStore(db: Database) {
  const parseEncryptedConfigMap: Record<
    SystemIntegrationProviderType,
    (encryptedConfig: string) => unknown
  > = {
    migadu: (encryptedConfig) =>
      migaduConfigSchema.parse(JSON.parse(decryptSecret(encryptedConfig))),
    coolify: (encryptedConfig) =>
      coolifyConfigSchema.parse(JSON.parse(decryptSecret(encryptedConfig))),
    github: (encryptedConfig) =>
      githubConfigSchema.parse(JSON.parse(decryptSecret(encryptedConfig))),
    minimax: (encryptedConfig) =>
      minimaxConfigSchema.parse(JSON.parse(decryptSecret(encryptedConfig))),
  };

  const parseConfigSchemaMap: Record<
    SystemIntegrationProviderType,
    z.ZodType<unknown>
  > = {
    migadu: migaduConfigSchema,
    coolify: coolifyConfigSchema,
    github: githubConfigSchema,
    minimax: minimaxConfigSchema,
  };

  async function listIntegrations(): Promise<SystemIntegrationSummary[]> {
    try {
      const rows = await db.query.systemIntegrations.findMany();

      const typedRows = rows.filter(
        (row) =>
          row.providerType === 'migadu' ||
          row.providerType === 'coolify' ||
          row.providerType === 'github' ||
          row.providerType === 'minimax',
      ) as SystemIntegration[];

      return typedRows.map((row) => {
        const { encryptedConfig, ...rest } = row;
        const rawConfig = parseIntegrationConfigForList(row.providerType, encryptedConfig);

        return {
          ...rest,
          isEnabled: row.isEnabled === 1,
          config: sanitizeForList(row.providerType, rawConfig),
        };
      });
    } catch (err) {
      forgeDebug({ scope: 'system-integrations', level: 'error', message: '[system-integrations] listIntegrations failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function getMigaduConfig(): Promise<MigaduSystemIntegrationConfig | null> {
    try {
      const row = await getEnabledIntegration('migadu');
      return row ? (parseMigaduConfig(row.encryptedConfig) as MigaduSystemIntegrationConfig) : null;
    } catch (err) {
      forgeDebug({ scope: 'system-integrations', level: 'error', message: '[system-integrations] getMigaduConfig failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function getCoolifyConfig(): Promise<CoolifySystemIntegrationConfig | null> {
    try {
      const row = await getEnabledIntegration('coolify');
      return row ? (parseCoolifyConfig(row.encryptedConfig) as CoolifySystemIntegrationConfig) : null;
    } catch (err) {
      forgeDebug({ scope: 'system-integrations', level: 'error', message: '[system-integrations] getCoolifyConfig failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function getGitHubConfig(): Promise<GitHubSystemIntegrationConfig | null> {
    try {
      const row = await getEnabledIntegration('github');
      return row ? (parseGitHubConfig(row.encryptedConfig) as GitHubSystemIntegrationConfig) : null;
    } catch (err) {
      forgeDebug({ scope: 'system-integrations', level: 'error', message: '[system-integrations] getGitHubConfig failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function getMinimaxConfig(): Promise<MinimaxSystemIntegrationConfig | null> {
    try {
      const row = await getEnabledIntegration('minimax');
      return row ? (parseMinimaxConfig(row.encryptedConfig) as MinimaxSystemIntegrationConfig) : null;
    } catch (err) {
      forgeDebug({ scope: 'system-integrations', level: 'error', message: '[system-integrations] getMinimaxConfig failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
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
    try {
      const now = Date.now();
      const parsedConfig = parseUpsertConfig(input.providerType, input.config);
      const existing = await db.query.systemIntegrations.findFirst({
        where: eq(systemIntegrations.providerType, input.providerType),
      });

      if (existing) {
        await db
          .update(systemIntegrations)
          .set({
            encryptedConfig: encryptSecret(JSON.stringify(parsedConfig)),
            isEnabled: input.isEnabled === false ? 0 : 1,
            updatedAt: now,
          })
          .where(eq(systemIntegrations.providerType, input.providerType));
      } else {
        await db.insert(systemIntegrations).values({
          providerType: input.providerType,
          encryptedConfig: encryptSecret(JSON.stringify(parsedConfig)),
          isEnabled: input.isEnabled === false ? 0 : 1,
          createdAt: now,
          updatedAt: now,
        });
      }

      return {
        providerType: input.providerType,
        isEnabled: input.isEnabled === false ? false : true,
        config: parsedConfig,
      };
    } catch (err) {
      forgeDebug({ scope: 'system-integrations', level: 'error', message: '[system-integrations] upsertIntegration failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function deleteIntegration(providerType: SystemIntegrationProviderType) {
    try {
      await db.delete(systemIntegrations).where(eq(systemIntegrations.providerType, providerType));
    } catch (err) {
      forgeDebug({ scope: 'system-integrations', level: 'error', message: '[system-integrations] deleteIntegration failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function getEnabledIntegration(providerType: SystemIntegrationProviderType) {
    const row = await db.query.systemIntegrations.findFirst({
      where: eq(systemIntegrations.providerType, providerType),
    });

    if (!row || row.isEnabled !== 1) {
      return null;
    }

    return row;
  }

  function parseMigaduConfig(encryptedConfig: string): MigaduSystemIntegrationConfig {
    return migaduConfigSchema.parse(JSON.parse(decryptSecret(encryptedConfig)));
  }

  function parseCoolifyConfig(encryptedConfig: string): CoolifySystemIntegrationConfig {
    return coolifyConfigSchema.parse(JSON.parse(decryptSecret(encryptedConfig)));
  }

  function parseGitHubConfig(encryptedConfig: string): GitHubSystemIntegrationConfig {
    return githubConfigSchema.parse(JSON.parse(decryptSecret(encryptedConfig)));
  }

  function parseMinimaxConfig(encryptedConfig: string): MinimaxSystemIntegrationConfig {
    return minimaxConfigSchema.parse(JSON.parse(decryptSecret(encryptedConfig)));
  }

  function parseIntegrationConfig(
    providerType: SystemIntegrationProviderType,
    encryptedConfig: string,
  ) {
    return parseEncryptedConfigMap[providerType](encryptedConfig);
  }

  function parseIntegrationConfigForList(
    providerType: SystemIntegrationProviderType,
    encryptedConfig: string,
  ) {
    try {
      return parseIntegrationConfig(providerType, encryptedConfig);
    } catch (error) {
      forgeDebug({ scope: 'system-integrations', level: 'info', message: 'Failed to parse integration config', context: { error: error instanceof Error ? error.message : String(error) } });
      return null;
    }
  }

  function sanitizeForList(
    providerType: SystemIntegrationProviderType,
    rawConfig: unknown,
  ): Record<string, unknown> | null {
    if (!rawConfig || typeof rawConfig !== 'object') {
      return null;
    }

    const sensitive = SENSITIVE_FIELDS[providerType] ?? [];
    const result: Record<string, unknown> = { ...(rawConfig as Record<string, unknown>) };

    for (const field of sensitive) {
      if (field in result) {
        result[field] = null;
      }
    }

    return result;
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
    if (!schema) {
      forgeDebug({ scope: 'system-integrations-store', level: 'error', message: 'system-integrations-store: validation/requirement failed' });
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
