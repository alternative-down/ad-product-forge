import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
import { InferModel } from 'drizzle-orm';
import { agentRoles } from './schema-roles.js';
import { llmProfiles } from './schema-llm.js';

export const agents = sqliteTable(
  'agents',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    roleId: text('role_id').references(() => agentRoles.id, { onDelete: 'set null' }),
    modelProfileId: text('model_profile_id')
      .notNull()
      .references(() => llmProfiles.id, { onDelete: 'restrict' }),
    omModelProfileId: text('om_model_profile_id')
      .notNull()
      .references(() => llmProfiles.id, { onDelete: 'restrict' }),
    instructions: text('instructions').notNull(),
    executionState: text('execution_state').notNull().default('idle'),
    lastExecutionError: text('last_execution_error'),
    lastExecutionErrorAt: integer('last_execution_error_at'),
    workspaceAutoSync: integer('workspace_auto_sync').notNull().default(1),
    workspaceBm25: integer('workspace_bm25').notNull().default(1),
    workspaceEmbedder: text('workspace_embedder')
      .notNull()
      .default('transformers-multilingual-e5-small-cpu'),
    workspaceFilesystem: text('workspace_filesystem'),
    workspaceSandbox: text('workspace_sandbox'),
    workspaceSkills: text('workspace_skills'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    agentsRoleIdIdx: index('agents_role_id_idx').on(table.roleId),
    agentsModelProfileIdIdx: index('agents_model_profile_id_idx').on(table.modelProfileId),
    agentsOmModelProfileIdIdx: index('agents_om_model_profile_id_idx').on(table.omModelProfileId),
  }),
);

export type Agent = InferModel<typeof agents>;
export type NewAgent = InferModel<typeof agents, 'insert'>;

export const agentProviders = sqliteTable(
  'agent_providers',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    providerType: text('provider_type').notNull(),
    encryptedCredentials: text('encrypted_credentials').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    agentProviderUnique: uniqueIndex('agent_provider_unique').on(table.agentId, table.providerType),
  }),
);

export type AgentProvider = InferModel<typeof agentProviders>;
export type NewAgentProvider = InferModel<typeof agentProviders, 'insert'>;

export const agentExecutionContracts = sqliteTable(
  'agent_execution_contracts',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    budgetUsd: real('budget_usd').notNull(),
    autoRenew: integer('auto_renew').notNull().default(1),
    fundedAt: integer('funded_at'),
    startsAt: integer('starts_at').notNull(),
    endsAt: integer('ends_at').notNull(),
    isActive: integer('is_active').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    agentContractsAgentIdIdx: index('agent_execution_contracts_agent_id_idx').on(table.agentId),
    agentContractsEndsAtIdx: index('agent_execution_contracts_ends_at_idx').on(table.endsAt),
    agentExecutionContractsUpdatedAtIdx: index('agent_execution_contracts_updated_at_idx').on(
      table.updatedAt,
    ),
  }),
);

export type AgentExecutionContract = InferModel<typeof agentExecutionContracts>;
export type NewAgentExecutionContract = InferModel<typeof agentExecutionContracts, 'insert'>;

export const agentExecutionSteps = sqliteTable(
  'agent_execution_steps',
  {
    id: text('id').primaryKey(),
    contractId: text('contract_id')
      .notNull()
      .references(() => agentExecutionContracts.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    llmProfileId: text('llm_profile_id')
      .notNull()
      .references(() => llmProfiles.id, { onDelete: 'restrict' }),
    modelKey: text('model_key').notNull(),
    kind: text('kind').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    cachedInputTokens: integer('cached_input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull(),
    inputPerMillionUsd: real('input_per_million_usd').notNull().default(0),
    inputCachePerMillionUsd: real('input_cache_per_million_usd').notNull().default(0),
    outputPerMillionUsd: real('output_per_million_usd').notNull().default(0),
    contractCostMultiplier: real('contract_cost_multiplier').notNull().default(1),
    costUsd: real('cost_usd').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    agentExecutionStepsAgentIdIdx: index('agent_execution_steps_agent_id_idx').on(table.agentId),
    agentExecutionStepsContractIdIdx: index('agent_execution_steps_contract_id_idx').on(
      table.contractId,
    ),
    agentExecutionStepsLlmProfileIdIdx: index('agent_execution_steps_llm_profile_id_idx').on(
      table.llmProfileId,
    ),
    agentExecutionStepsCreatedAtIdx: index('agent_execution_steps_created_at_idx').on(
      table.createdAt,
    ),
  }),
);

export type AgentExecutionStep = InferModel<typeof agentExecutionSteps>;
export type NewAgentExecutionStep = InferModel<typeof agentExecutionSteps, 'insert'>;

export const agentHomeMetricSnapshots = sqliteTable(
  'agent_home_metric_snapshots',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    stepId: text('step_id')
      .notNull()
      .references(() => agentExecutionSteps.id, { onDelete: 'cascade' }),
    stepCreatedAt: integer('step_created_at').notNull(),
    snapshot: text('snapshot').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    agentHomeMetricSnapshotsAgentIdIdx: index('agent_home_metric_snapshots_agent_id_idx').on(
      table.agentId,
    ),
    agentHomeMetricSnapshotsCreatedAtIdx: index('agent_home_metric_snapshots_created_at_idx').on(
      table.createdAt,
    ),
    agentHomeMetricSnapshotsStepIdIdx: uniqueIndex('agent_home_metric_snapshots_step_id_idx').on(
      table.stepId,
    ),
  }),
);

export type AgentHomeMetricSnapshot = InferModel<typeof agentHomeMetricSnapshots>;
export type NewAgentHomeMetricSnapshot = InferModel<typeof agentHomeMetricSnapshots, 'insert'>;

export const agentCheckpointedOmStates = sqliteTable(
  'agent_checkpointed_om_states',
  {
    agentId: text('agent_id')
      .primaryKey()
      .references(() => agents.id, { onDelete: 'cascade' }),
    threadId: text('thread_id').notNull(),
    resourceId: text('resource_id').notNull(),
    state: text('state').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    agentCheckpointedOmStatesThreadIdIdx: uniqueIndex(
      'agent_checkpointed_om_states_thread_id_idx',
    ).on(table.threadId),
  }),
);

export type AgentCheckpointedOmState = InferModel<typeof agentCheckpointedOmStates>;
export type NewAgentCheckpointedOmState = InferModel<typeof agentCheckpointedOmStates, 'insert'>;

export const agentLongTermMemoryStates = sqliteTable('agent_long_term_memory_states', {
  agentId: text('agent_id')
    .primaryKey()
    .references(() => agents.id, { onDelete: 'cascade' }),
  state: text('state').notNull(),
  recallIndexStamp: text('recall_index_stamp'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type AgentLongTermMemoryState = InferModel<typeof agentLongTermMemoryStates>;
export type NewAgentLongTermMemoryState = InferModel<typeof agentLongTermMemoryStates, 'insert'>;

export const agentLongTermMemoryRecallStates = sqliteTable('agent_long_term_memory_recall_states', {
  agentId: text('agent_id')
    .primaryKey()
    .references(() => agents.id, { onDelete: 'cascade' }),
  threadId: text('thread_id'),
  resourceId: text('resource_id'),
  snapshot: text('snapshot'),
  history: text('history'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type AgentLongTermMemoryRecallState = InferModel<typeof agentLongTermMemoryRecallStates>;
export type NewAgentLongTermMemoryRecallState = InferModel<
  typeof agentLongTermMemoryRecallStates,
  'insert'
>;

export const agentNotifications = sqliteTable(
  'agent_notifications',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    readAt: integer('read_at'),
  },
  (table) => ({
    agentNotificationsAgentIdIdx: index('agent_notifications_agent_id_idx').on(table.agentId),
    agentNotificationsCreatedAtIdx: index('agent_notifications_created_at_idx').on(table.createdAt),
    agentNotificationsReadAtIdx: index('agent_notifications_read_at_idx').on(table.readAt),
  }),
);

export type AgentNotification = InferModel<typeof agentNotifications>;
export type NewAgentNotification = InferModel<typeof agentNotifications, 'insert'>;

export const agentSchedules = sqliteTable(
  'agent_schedules',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('agent'),
    name: text('name').notNull(),
    description: text('description'),
    scheduleType: text('schedule_type').notNull(),
    cronExpression: text('cron_expression'),
    scheduledDate: integer('scheduled_date'),
    timezone: text('timezone').notNull(),
    content: text('content').notNull(),
    wakeWhenRunning: integer('wake_when_running').notNull().default(1),
    isActive: integer('is_active').notNull().default(1),
    lastTriggeredAt: integer('last_triggered_at'),
    nextTriggerAt: integer('next_trigger_at'),
    creatorId: text('creator_id').references(() => agents.id, { onDelete: 'set null' }),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    agentSchedulesAgentIdIdx: index('agent_schedules_agent_id_idx').on(table.agentId),
    agentSchedulesIsActiveIdx: index('agent_schedules_is_active_idx').on(table.isActive),
    agentSchedulesNextTriggerAtIdx: index('agent_schedules_next_trigger_at_idx').on(
      table.nextTriggerAt,
    ),
    agentSchedulesCreatorIdIdx: index('idx_schedules_creator_id').on(table.creatorId),
  }),
);

export type AgentSchedule = InferModel<typeof agentSchedules>;
export type NewAgentSchedule = InferModel<typeof agentSchedules, 'insert'>;