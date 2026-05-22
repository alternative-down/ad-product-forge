import {
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { z } from 'zod';
import { InferModel } from 'drizzle-orm';

const _MigaduSystemIntegrationConfigSchema = z.object({
  apiUser: z.string().email(),
  apiKey: z.string().min(1),
});

const _CoolifySystemIntegrationConfigSchema = z.object({
  baseUrl: z.string().url(),
  adminToken: z.string().min(1),
  serverId: z.string().min(1),
  destinationId: z.string().min(1),
  applicationsBaseDomain: z.string().min(1).optional(),
});

const _GitHubSystemIntegrationConfigSchema = z.object({
  organization: z.string().min(1),
  appHomeUrl: z.string().url(),
});

const _MinimaxSystemIntegrationConfigSchema = z.object({
  apiKey: z.string().min(1),
});

export type MigaduSystemIntegrationConfig = z.infer<typeof _MigaduSystemIntegrationConfigSchema>;
export type CoolifySystemIntegrationConfig = z.infer<typeof _CoolifySystemIntegrationConfigSchema>;
export type GitHubSystemIntegrationConfig = z.infer<typeof _GitHubSystemIntegrationConfigSchema>;
export type MinimaxSystemIntegrationConfig = z.infer<typeof _MinimaxSystemIntegrationConfigSchema>;
export type SystemIntegrationConfigMap = {
  migadu: MigaduSystemIntegrationConfig;
  coolify: CoolifySystemIntegrationConfig;
  github: GitHubSystemIntegrationConfig;
  minimax: MinimaxSystemIntegrationConfig;
};

export const systemIntegrations = sqliteTable('system_integrations', {
  providerType: text('provider_type').primaryKey(),
  encryptedConfig: text('encrypted_config').notNull(),
  isEnabled: integer('is_enabled').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type SystemIntegration = InferModel<typeof systemIntegrations>;
export type NewSystemIntegration = InferModel<typeof systemIntegrations, 'insert'>;