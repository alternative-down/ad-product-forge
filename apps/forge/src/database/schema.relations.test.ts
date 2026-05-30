import { describe, expect, it } from 'vitest';

import * as schema from './schema';

// Every table and relation defined in schema.ts should be exported.
const tableExports = [
  // Agents
  'agents',
  'agentProviders',
  'agentExecutionContracts',
  'agentExecutionSteps',
  'agentHomeMetricSnapshots',
  'agentCheckpointedOmStates',
  'agentLongTermMemoryStates',
  'agentLongTermMemoryRecallStates',
  'agentNotifications',
  'agentSchedules',
  // Roles
  'agentRoles',
  'roleToolPermissions',
  'roleWorkflowPermissions',
  // LLM
  'llmProfiles',
  'llmModelPrices',
  'systemLlmDefaults',
  // Finance
  'companyCashLedger',
  'companyRecurringPayables',
  // Config
  'systemSettings',
  // Integrations
  'systemIntegrations',
  // Chat
  'internalChatAccounts',
  'internalChatConversations',
  'internalChatConversationMembers',
  'internalChatMessages',
  'internalChatMessageReads',
  'internalChatMessageAttachments',
  // MCP
  'mcpServerConfigs',
  'agentMcpConfigs',
  // Webhooks
  'webhookRoutes',
  'webhookEvents',
  // Knowledge
  'knowledgeDocuments',
  // Tickets
  'tickets',
  'ticketMessages',
] as const;

const relationExports = [
  'agentsRelations',
  'llmProfilesRelations',
  'agentRolesRelations',
  'roleToolPermissionsRelations',
  'roleWorkflowPermissionsRelations',
  'agentProvidersRelations',
  'agentExecutionContractsRelations',
  'agentExecutionStepsRelations',
  'agentHomeMetricSnapshotsRelations',
  'agentCheckpointedOmStatesRelations',
  'agentLongTermMemoryStatesRelations',
  'agentLongTermMemoryRecallStatesRelations',
  'agentNotificationsRelations',
  'agentSchedulesRelations',
  'systemSettingsRelations',
  'llmModelPricesRelations',
  'companyRecurringPayablesRelations',
  'systemIntegrationsRelations',
  'companyCashLedgerRelations',
  'systemLlmDefaultsRelations',
  'internalChatAccountsRelations',
  'internalChatConversationsRelations',
  'internalChatConversationMembersRelations',
  'internalChatMessagesRelations',
  'internalChatMessageReadsRelations',
  'internalChatMessageAttachmentsRelations',
  'mcpServerConfigsRelations',
  'agentMcpConfigsRelations',
  'webhookRoutesRelations',
  'webhookEventsRelations',
  'knowledgeDocumentsRelations',
  'ticketsRelations',
  'ticketMessagesRelations',
] as const;

describe('schema exports', () => {
  describe('tables', () => {
    tableExports.forEach((name) => {
      it(`${name} is exported`, () => {
        expect(schema).toHaveProperty(name);
      });

      it(`${name} is a non-null object (Drizzle table)`, () => {
        expect((schema as Record<string, unknown>)[name]).toBeDefined();
        expect(typeof (schema as Record<string, unknown>)[name]).toBe('object');
      });
    });
  });

  describe('relations', () => {
    // Drizzle relations are objects (relation definitions), not functions.
    // Each is defined via relations() which returns a relation proxy object.
    relationExports.forEach((name) => {
      it(`${name} is exported`, () => {
        expect(schema).toHaveProperty(name);
      });

      it(`${name} is an object (Drizzle relation definition)`, () => {
        expect(typeof (schema as Record<string, unknown>)[name]).toBe('object');
      });
    });
  });
});

describe('schema module', () => {
  it('is importable without errors', async () => {
    const mod = await import('./schema');
    expect(mod).toBeDefined();
  });

  it('exports all expected table names', async () => {
    const mod = (await import('./schema')) as typeof schema;
    tableExports.forEach((name) => {
      expect(mod).toHaveProperty(name);
    });
  });

  it('exports all expected relation names', async () => {
    const mod = (await import('./schema')) as typeof schema;
    relationExports.forEach((name) => {
      expect(mod).toHaveProperty(name);
    });
  });
});
