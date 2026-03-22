import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '../database/index';
import type {
  CoolifySystemIntegrationConfig,
  GitHubSystemIntegrationConfig,
  MigaduSystemIntegrationConfig,
} from '../database/schema';
import { systemIntegrations } from '../database/schema';
import { decryptSecret, encryptSecret } from '../encryption/crypto';

const migaduConfigSchema = z.object({
  apiUser: z.string().email(),
  apiKey: z.string().min(1),
});

const coolifyConfigSchema = z.object({
  baseUrl: z.string().url(),
  adminToken: z.string().min(1),
  applicationsBaseDomain: z.string().min(1).optional(),
});

const githubConfigSchema = z.object({
  organization: z.string().min(1),
  appHomeUrl: z.string().url(),
});

export type SystemIntegrationProviderType = 'migadu' | 'coolify' | 'github';

export function createSystemIntegrationStore(db: Database) {
  async function listIntegrations() {
    const rows = await db.query.systemIntegrations.findMany({
      orderBy: (fields, { asc }) => [asc(fields.providerType)],
    });

    return rows
      .filter((row): row is typeof row & { providerType: SystemIntegrationProviderType } =>
        row.providerType === 'migadu' || row.providerType === 'coolify' || row.providerType === 'github',
      )
      .map((row) => {
        const { encryptedConfig, ...rest } = row;

        return {
          ...rest,
          isEnabled: row.isEnabled === 1,
          config: parseIntegrationConfig(row.providerType, encryptedConfig),
        };
      });
  }

  async function getMigaduConfig(): Promise<MigaduSystemIntegrationConfig | null> {
    const row = await getEnabledIntegration('migadu');
    return row ? parseMigaduConfig(row.encryptedConfig) : null;
  }

  async function getCoolifyConfig(): Promise<CoolifySystemIntegrationConfig | null> {
    const row = await getEnabledIntegration('coolify');
    return row ? parseCoolifyConfig(row.encryptedConfig) : null;
  }

  async function getGitHubConfig(): Promise<GitHubSystemIntegrationConfig | null> {
    const row = await getEnabledIntegration('github');
    return row ? parseGitHubConfig(row.encryptedConfig) : null;
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
        },
  ) {
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
  }

  async function deleteIntegration(providerType: SystemIntegrationProviderType) {
    await db.delete(systemIntegrations).where(eq(systemIntegrations.providerType, providerType));
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

  function parseIntegrationConfig(
    providerType: SystemIntegrationProviderType,
    encryptedConfig: string,
  ) {
    if (providerType === 'migadu') {
      return parseMigaduConfig(encryptedConfig);
    }

    if (providerType === 'coolify') {
      return parseCoolifyConfig(encryptedConfig);
    }

    if (providerType === 'github') {
      return parseGitHubConfig(encryptedConfig);
    }
  }

  function parseUpsertConfig(
    providerType: SystemIntegrationProviderType,
    config:
      | MigaduSystemIntegrationConfig
      | CoolifySystemIntegrationConfig
      | GitHubSystemIntegrationConfig,
  ) {
    if (providerType === 'migadu') {
      return migaduConfigSchema.parse(config);
    }

    if (providerType === 'coolify') {
      return coolifyConfigSchema.parse(config);
    }

    if (providerType === 'github') {
      return githubConfigSchema.parse(config);
    }
  }

  return {
    listIntegrations,
    getMigaduConfig,
    getCoolifyConfig,
    getGitHubConfig,
    upsertIntegration,
    deleteIntegration,
  };
}
