/**
 * Schema Drizzle ORM para libsql
 *
 * APLICAÇÃO (ad-product-forge):
 * - agents: Configuração de agentes
 * - agent_providers: Associação agente-provedor com credenciais
 *
 * IMPORTANTE:
 * - internal-chat é persistido no banco central da aplicação
 * - os demais providers continuam no módulo de comunicação do mastra-engine por enquanto
 * - Cada agente tem seu próprio banco de dados (path relativo a workspace)
 */

import { relations } from 'drizzle-orm';


import {
  agents,
  agentProviders,
  agentExecutionContracts,
  agentExecutionSteps,
  agentHomeMetricSnapshots,
  agentCheckpointedOmStates,
  agentLongTermMemoryStates,
  agentLongTermMemoryRecallStates,
  agentNotifications,
  agentSchedules,
} from './schema-agents.js';
import {
  agentRoles,
  roleToolPermissions,
  roleWorkflowPermissions,
} from './schema-roles.js';
import {
  llmProfiles,
  llmModelPrices,
  systemLlmDefaults,
} from './schema-llm.js';
import {
  companyCashLedger,
  companyRecurringPayables,
} from './schema-finance.js';
import {
  systemSettings,
} from './schema-config.js';
import {
  systemIntegrations,
} from './schema-integrations.js';
import {
  internalChatAccounts,
  internalChatConversations,
  internalChatConversationMembers,
  internalChatMessages,
  internalChatMessageReads,
  internalChatMessageAttachments,
} from './schema-chat.js';
import {
  mcpServerConfigs,
  agentMcpConfigs,
} from './schema-mcp.js';
import {
  webhookRoutes,
  webhookEvents,
} from './schema-webhooks.js';
import {
  knowledgeDocuments,
} from './schema-knowledge.js';
import {
  tickets,
  ticketMessages,
} from './schema-tickets.js';

export const systemSettingsRelations = relations(systemSettings, () => ({}));

export const llmModelPricesRelations = relations(llmModelPrices, () => ({}));

export const companyRecurringPayablesRelations = relations(companyRecurringPayables, () => ({}));

export const systemIntegrationsRelations = relations(systemIntegrations, () => ({}));

export const companyCashLedgerRelations = relations(companyCashLedger, () => ({}));

export const systemLlmDefaultsRelations = relations(systemLlmDefaults, () => ({}));

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

export const llmProfilesRelations = relations(llmProfiles, ({ many }) => ({
  agentsAsPrimaryModel: many(agents, {
    relationName: 'agent_model_profile',
  }),
  agentsAsOmModel: many(agents, {
    relationName: 'agent_om_model_profile',
  }),
}));

export const agentRolesRelations = relations(agentRoles, ({ many }) => ({
  agents: many(agents),
  toolPermissions: many(roleToolPermissions),
  workflowPermissions: many(roleWorkflowPermissions),
}));

export const roleToolPermissionsRelations = relations(roleToolPermissions, ({ one }) => ({
  role: one(agentRoles, {
    fields: [roleToolPermissions.roleId],
    references: [agentRoles.id],
  }),
}));

export const roleWorkflowPermissionsRelations = relations(roleWorkflowPermissions, ({ one }) => ({
  role: one(agentRoles, {
    fields: [roleWorkflowPermissions.roleId],
    references: [agentRoles.id],
  }),
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

export const internalChatAccountsRelations = relations(internalChatAccounts, ({ one }) => ({
  agent: one(agents, {
    fields: [internalChatAccounts.agentId],
    references: [agents.id],
  }),
}));

export const internalChatConversationsRelations = relations(
  internalChatConversations,
  ({ one, many }) => ({
    creator: one(internalChatAccounts, {
      fields: [internalChatConversations.createdByAccountId],
      references: [internalChatAccounts.id],
    }),
    members: many(internalChatConversationMembers),
    messages: many(internalChatMessages),
  }),
);

export const internalChatConversationMembersRelations = relations(
  internalChatConversationMembers,
  ({ one }) => ({
    conversation: one(internalChatConversations, {
      fields: [internalChatConversationMembers.conversationId],
      references: [internalChatConversations.id],
    }),
    account: one(internalChatAccounts, {
      fields: [internalChatConversationMembers.accountId],
      references: [internalChatAccounts.id],
    }),
  }),
);

export const internalChatMessagesRelations = relations(internalChatMessages, ({ one, many }) => ({
  conversation: one(internalChatConversations, {
    fields: [internalChatMessages.conversationId],
    references: [internalChatConversations.id],
  }),
  author: one(internalChatAccounts, {
    fields: [internalChatMessages.authorAccountId],
    references: [internalChatAccounts.id],
  }),
  attachments: many(internalChatMessageAttachments),
  reads: many(internalChatMessageReads),
}));

export const internalChatMessageReadsRelations = relations(internalChatMessageReads, ({ one }) => ({
  message: one(internalChatMessages, {
    fields: [internalChatMessageReads.messageId],
    references: [internalChatMessages.id],
  }),
  agent: one(agents, {
    fields: [internalChatMessageReads.agentId],
    references: [agents.id],
  }),
}));

export const internalChatMessageAttachmentsRelations = relations(
  internalChatMessageAttachments,
  ({ one }) => ({
    message: one(internalChatMessages, {
      fields: [internalChatMessageAttachments.messageId],
      references: [internalChatMessages.id],
    }),
  }),
);

export const mcpServerConfigsRelations = relations(mcpServerConfigs, ({ many }) => ({
  agentConfigs: many(agentMcpConfigs),
}));

export const agentMcpConfigsRelations = relations(agentMcpConfigs, ({ one }) => ({
  agent: one(agents, {
    fields: [agentMcpConfigs.agentId],
    references: [agents.id],
  }),
  server: one(mcpServerConfigs, {
    fields: [agentMcpConfigs.serverId],
    references: [mcpServerConfigs.id],
  }),
}));

export const webhookRoutesRelations = relations(webhookRoutes, ({ one, many }) => ({
  agent: one(agents, {
    fields: [webhookRoutes.agentId],
    references: [agents.id],
  }),
  events: many(webhookEvents),
}));

export const webhookEventsRelations = relations(webhookEvents, ({ one }) => ({
  route: one(webhookRoutes, {
    fields: [webhookEvents.routeId],
    references: [webhookRoutes.routeId],
  }),
  agent: one(agents, {
    fields: [webhookEvents.agentId],
    references: [agents.id],
  }),
}));

export const knowledgeDocumentsRelations = relations(knowledgeDocuments, ({ one }) => ({
  owner: one(agents, {
    fields: [knowledgeDocuments.ownerAgentId],
    references: [agents.id],
  }),
}));

export const ticketsRelations = relations(tickets, ({ one: _one, many }) => ({
  messages: many(ticketMessages),
}));

export const ticketMessagesRelations = relations(ticketMessages, ({ one }) => ({
  ticket: one(tickets, {
    fields: [ticketMessages.ticketId],
    references: [tickets.id],
  }),
}));

import type { Database } from './client';
export type { Database };