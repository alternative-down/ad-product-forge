import {
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { z } from 'zod';
import { InferModel } from 'drizzle-orm';

export const WorkspaceFilesystemConfigSchema = z.object({
  basePath: z.string(),
  allowedPaths: z.array(z.string()).optional(),
});

export const WorkspaceSandboxConfigSchema = z.object({
  workingDirectory: z.string(),
});

export const WorkspaceSkillsConfigSchema = z.array(z.string());

export type WorkspaceFilesystemConfig = z.infer<typeof WorkspaceFilesystemConfigSchema>;
export type WorkspaceSandboxConfig = z.infer<typeof WorkspaceSandboxConfigSchema>;
export type WorkspaceSkillsConfig = z.infer<typeof WorkspaceSkillsConfigSchema>;

export const systemSettings = sqliteTable('system_settings', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull().default(0),
  companyName: text('company_name').notNull(),
  companyContext: text('company_context').notNull(),
  stepDelayEnabled: integer('step_delay_enabled').notNull().default(1),
  communicationDmFlushingEnabled: integer('communication_dm_flushing_enabled').notNull().default(1),
  communicationGroupFlushingEnabled: integer('communication_group_flushing_enabled')
    .notNull()
    .default(1),
  memoryLastMessagesFullEnabled: integer('memory_last_messages_full_enabled').notNull().default(0),
  memoryLastMessagesCount: integer('memory_last_messages_count').notNull().default(20),
  tokenCountFilterEnabled: integer('token_count_filter_enabled').notNull().default(1),
  tokenCountFilterLimit: integer('token_count_filter_limit').notNull().default(100000),
  checkpointedOmEnabled: integer('checkpointed_om_enabled').notNull().default(0),
  checkpointedOmTotalContextTokens: integer('checkpointed_om_total_context_tokens')
    .notNull()
    .default(50000),
  checkpointedOmRecentRawTokens: integer('checkpointed_om_recent_raw_tokens')
    .notNull()
    .default(10000),
  checkpointedOmRawObservationBatchTokens: integer('checkpointed_om_raw_observation_batch_tokens')
    .notNull()
    .default(5000),
  checkpointedOmObservationReflectionBatchTokens: integer(
    'checkpointed_om_observation_reflection_batch_tokens',
  )
    .notNull()
    .default(5000),
  checkpointedOmObservationSupportTokens: integer('checkpointed_om_observation_support_tokens')
    .notNull()
    .default(2000),
  checkpointedOmReflectionSupportTokens: integer('checkpointed_om_reflection_support_tokens')
    .notNull()
    .default(2000),
  omObservationMessageTokens: integer('om_observation_message_tokens').notNull().default(15000),
  omObservationBufferTokens: real('om_observation_buffer_tokens').notNull().default(0.2),
  omObservationBufferActivation: real('om_observation_buffer_activation').notNull().default(0.8),
  omObservationPreviousObserverTokens: integer('om_observation_previous_observer_tokens')
    .notNull()
    .default(1000),
  omReflectionObservationTokens: integer('om_reflection_observation_tokens')
    .notNull()
    .default(20000),
  omReflectionBufferActivation: real('om_reflection_buffer_activation').notNull().default(0.5),
  ltmRecallSearchMode: text('ltm_recall_search_mode').notNull().default('hybrid'),
  ltmRecallWorkspaceTopK: integer('ltm_recall_workspace_top_k').notNull().default(3),
  ltmRecallGraphTopK: integer('ltm_recall_graph_top_k').notNull().default(3),
  ltmRecallGraphThreshold: real('ltm_recall_graph_threshold').notNull().default(0.7),
  ltmRecallGraphRandomWalkSteps: integer('ltm_recall_graph_random_walk_steps')
    .notNull()
    .default(50),
  ltmRecallGraphIncludeSources: integer('ltm_recall_graph_include_sources').notNull().default(1),
  ltmRecallScoreThreshold: real('ltm_recall_score_threshold').notNull().default(0.7),
  ltmRecallDocumentCount: integer('ltm_recall_document_count').notNull().default(3),
  updatedAt: integer('updated_at').notNull(),
});

export type SystemSettings = InferModel<typeof systemSettings>;
export type NewSystemSettings = InferModel<typeof systemSettings, 'insert'>;