import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
import { InferModel } from 'drizzle-orm';

export const llmProfiles = sqliteTable(
  'llm_profiles',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    modelKey: text('model_key').notNull(),
    baseUrl: text('base_url'),
    encryptedApiKey: text('encrypted_api_key').notNull(),
    contractCostMultiplier: real('contract_cost_multiplier').notNull().default(1),
    isEnabled: integer('is_enabled').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    llmProfilesNameIdx: uniqueIndex('llm_profiles_name_idx').on(table.name),
    llmProfilesModelKeyIdx: index('llm_profiles_model_key_idx').on(table.modelKey),
    llmProfilesIsEnabledIdx: index('llm_profiles_is_enabled_idx').on(table.isEnabled),
  }),
);

export type LlmProfile = InferModel<typeof llmProfiles>;
export type NewLlmProfile = InferModel<typeof llmProfiles, 'insert'>;

export const llmModelPrices = sqliteTable('llm_model_prices', {
  modelKey: text('model_key').primaryKey(),
  inputPerMillionUsd: real('input_per_million_usd').notNull(),
  inputCachePerMillionUsd: real('input_cache_per_million_usd').notNull(),
  outputPerMillionUsd: real('output_per_million_usd').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type LlmModelPrice = InferModel<typeof llmModelPrices>;
export type NewLlmModelPrice = InferModel<typeof llmModelPrices, 'insert'>;

export const systemLlmDefaults = sqliteTable('system_llm_defaults', {
  id: text('id').primaryKey(),
  primaryProfileId: text('primary_profile_id').notNull(),
  omProfileId: text('om_profile_id').notNull(),
  hiringRhProfileId: text('hiring_rh_profile_id').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type SystemLlmDefaults = InferModel<typeof systemLlmDefaults>;
export type NewSystemLlmDefaults = InferModel<typeof systemLlmDefaults, 'insert'>;