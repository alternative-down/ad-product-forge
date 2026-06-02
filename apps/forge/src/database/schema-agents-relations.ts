/**
 * Drizzle relations for schema-agents tables.
 *
 * Extracted from schema.ts in #5337 to colocate table definitions with their relations.
 */
import { relations } from 'drizzle-orm';

import {
  agentCheckpointedOmStates,
  agentExecutionContracts,
  agentExecutionSteps,
  agentHomeMetricSnapshots,
  agentLongTermMemoryRecallStates,
  agentLongTermMemoryStates,
  agentNotifications,
  agentProviders,
  agentSchedules,
  agents
} from './schema-agents.js';

import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatMessages
} from './schema-chat.js';

import {
  llmProfiles
} from './schema-llm.js';

import {
  agentRoles
} from './schema-roles.js';

export const agentsRelations = relations(agents, ({ one, many }) => ({
  role: one(agentRoles, {
    fields: [agents.roleId],
    references: [agentRoles.id],
  }),
  modelProfile: one(llmProfiles, {
    relationName: 'agent_model_profile',
    fields: [agents.modelProfileId],
    references: [llmProfiles.id],
  }),
  omModelProfile: one(llmProfiles, {
    relationName: 'agent_om_model_profile',
    fields: [agents.omModelProfileId],
    references: [llmProfiles.id],
  }),
  providers: many(agentProviders),
  executionContracts: many(agentExecutionContracts),
  executionSteps: many(agentExecutionSteps),
  homeMetricSnapshots: many(agentHomeMetricSnapshots),
  notifications: many(agentNotifications),
  schedules: many(agentSchedules),
  internalChatAccount: one(internalChatAccounts, {
    fields: [agents.id],
    references: [internalChatAccounts.agentId],
  }),
  internalChatMemberships: many(internalChatConversationMembers),
  internalChatMessages: many(internalChatMessages),
}));


export const agentProvidersRelations = relations(agentProviders, ({ one }) => ({
  agent: one(agents, {
    fields: [agentProviders.agentId],
    references: [agents.id],
  }),
}));


export const agentExecutionContractsRelations = relations(
  agentExecutionContracts,
  ({ one, many }) => ({
    agent: one(agents, {
      fields: [agentExecutionContracts.agentId],
      references: [agents.id],
    }),
    steps: many(agentExecutionSteps),
  }),
);


export const agentExecutionStepsRelations = relations(agentExecutionSteps, ({ one }) => ({
  agent: one(agents, {
    fields: [agentExecutionSteps.agentId],
    references: [agents.id],
  }),
  contract: one(agentExecutionContracts, {
    fields: [agentExecutionSteps.contractId],
    references: [agentExecutionContracts.id],
  }),
}));


export const agentHomeMetricSnapshotsRelations = relations(agentHomeMetricSnapshots, ({ one }) => ({
  agent: one(agents, {
    fields: [agentHomeMetricSnapshots.agentId],
    references: [agents.id],
  }),
  step: one(agentExecutionSteps, {
    fields: [agentHomeMetricSnapshots.stepId],
    references: [agentExecutionSteps.id],
  }),
}));


export const agentCheckpointedOmStatesRelations = relations(
  agentCheckpointedOmStates,
  ({ one }) => ({
    agent: one(agents, {
      fields: [agentCheckpointedOmStates.agentId],
      references: [agents.id],
    }),
  }),
);


export const agentLongTermMemoryStatesRelations = relations(
  agentLongTermMemoryStates,
  ({ one }) => ({
    agent: one(agents, {
      fields: [agentLongTermMemoryStates.agentId],
      references: [agents.id],
    }),
  }),
);


export const agentLongTermMemoryRecallStatesRelations = relations(
  agentLongTermMemoryRecallStates,
  ({ one }) => ({
    agent: one(agents, {
      fields: [agentLongTermMemoryRecallStates.agentId],
      references: [agents.id],
    }),
  }),
);


export const agentNotificationsRelations = relations(agentNotifications, ({ one }) => ({
  agent: one(agents, {
    fields: [agentNotifications.agentId],
    references: [agents.id],
  }),
}));


export const agentSchedulesRelations = relations(agentSchedules, ({ one }) => ({
  agent: one(agents, {
    fields: [agentSchedules.agentId],
    references: [agents.id],
  }),
}));

