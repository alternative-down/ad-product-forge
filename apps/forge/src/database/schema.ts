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


// export * from './schema-agents.js';
// export * from './schema-roles.js';
// export * from './schema-llm.js';
// export * from './schema-finance.js';
// export * from './schema-config.js';
// export * from './schema-integrations.js';
// export * from './schema-chat.js';
// export * from './schema-mcp.js';
// export * from './schema-webhooks.js';
// export * from './schema-knowledge.js';
// export * from './schema-tickets.js';


// Named re-exports for all tables and types (satisfies ESLint reexport-check)
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export { agents, agentProviders, agentExecutionContracts, agentExecutionSteps, agentHomeMetricSnapshots, agentCheckpointedOmStates, agentLongTermMemoryStates, agentLongTermMemoryRecallStates, agentNotifications, agentSchedules } from './schema-agents.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export type { Agent, NewAgent, AgentProvider, NewAgentProvider, AgentExecutionContract, NewAgentExecutionContract, AgentExecutionStep, NewAgentExecutionStep, AgentHomeMetricSnapshot, NewAgentHomeMetricSnapshot, AgentCheckpointedOmState, NewAgentCheckpointedOmState, AgentLongTermMemoryState, NewAgentLongTermMemoryState, AgentLongTermMemoryRecallState, NewAgentLongTermMemoryRecallState, AgentNotification, NewAgentNotification, AgentSchedule, NewAgentSchedule } from './schema-agents.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export { agentRoles, roleToolPermissions, roleWorkflowPermissions } from './schema-roles.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export type { AgentRole, NewAgentRole, RoleToolPermission, NewRoleToolPermission, RoleWorkflowPermission, NewRoleWorkflowPermission } from './schema-roles.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export { llmProfiles, llmModelPrices, systemLlmDefaults } from './schema-llm.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export type { LlmProfile, NewLlmProfile, LlmModelPrice, NewLlmModelPrice, SystemLlmDefaults, NewSystemLlmDefaults } from './schema-llm.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export { companyCashLedger, companyRecurringPayables } from './schema-finance.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export type { CompanyCashLedgerEntry, NewCompanyCashLedgerEntry, CompanyRecurringPayable, NewCompanyRecurringPayable } from './schema-finance.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export { systemSettings } from './schema-config.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export type { SystemSettings, NewSystemSettings, WorkspaceFilesystemConfig, WorkspaceSandboxConfig, WorkspaceSkillsConfig } from './schema-config.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export { systemIntegrations } from './schema-integrations.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export type { SystemIntegration, NewSystemIntegration, MigaduSystemIntegrationConfig, CoolifySystemIntegrationConfig, GitHubSystemIntegrationConfig, MinimaxSystemIntegrationConfig, SystemIntegrationConfigMap } from './schema-integrations.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export { internalChatAccounts, internalChatConversations, internalChatConversationMembers, internalChatMessages, internalChatMessageReads, internalChatMessageAttachments } from './schema-chat.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export type { InternalChatAccount, NewInternalChatAccount, InternalChatConversation, NewInternalChatConversation, InternalChatConversationMember, NewInternalChatConversationMember, InternalChatMessage, NewInternalChatMessage, InternalChatMessageRead, NewInternalChatMessageRead, InternalChatMessageAttachment, NewInternalChatMessageAttachment } from './schema-chat.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export { mcpServerConfigs, agentMcpConfigs } from './schema-mcp.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export type { McpServerConfig, NewMcpServerConfig, AgentMcpConfig, NewAgentMcpConfig } from './schema-mcp.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export { webhookRoutes, webhookEvents } from './schema-webhooks.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export type { WebhookRoute, NewWebhookRoute, WebhookEvent, NewWebhookEvent } from './schema-webhooks.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export { knowledgeDocuments } from './schema-knowledge.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export type { KnowledgeDocument, NewKnowledgeDocument } from './schema-knowledge.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export { tickets, ticketMessages } from './schema-tickets.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
export type { Ticket, NewTicket, TicketMessage, NewTicketMessage } from './schema-tickets.js';

// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- barrel aggregating relations from schema-agents-relations
export * from './schema-agents-relations.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- barrel aggregating relations from schema-chat-relations
export * from './schema-chat-relations.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- barrel aggregating relations from schema-config-relations
export * from './schema-config-relations.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- barrel aggregating relations from schema-finance-relations
export * from './schema-finance-relations.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- barrel aggregating relations from schema-integrations-relations
export * from './schema-integrations-relations.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- barrel aggregating relations from schema-knowledge-relations
export * from './schema-knowledge-relations.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- barrel aggregating relations from schema-llm-relations
export * from './schema-llm-relations.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- barrel aggregating relations from schema-mcp-relations
export * from './schema-mcp-relations.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- barrel aggregating relations from schema-roles-relations
export * from './schema-roles-relations.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- barrel aggregating relations from schema-tickets-relations
export * from './schema-tickets-relations.js';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- barrel aggregating relations from schema-webhooks-relations
export * from './schema-webhooks-relations.js';
