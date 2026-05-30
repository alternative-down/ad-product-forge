import { describe, expect, it } from 'vitest';

import * as agentsSchema from './schema-agents';
import * as rolesSchema from './schema-roles';
import * as llmSchema from './schema-llm';
import * as financeSchema from './schema-finance';
import * as configSchema from './schema-config';
import * as integrationsSchema from './schema-integrations';
import * as chatSchema from './schema-chat';
import * as mcpSchema from './schema-mcp';
import * as webhooksSchema from './schema-webhooks';
import * as knowledgeSchema from './schema-knowledge';
import * as ticketsSchema from './schema-tickets';
import * as schema from './schema';

// Every relation defined in schema.ts should be exported.
const relationExports = [
  'systemSettingsRelations',
  'llmModelPricesRelations',
  'companyRecurringPayablesRelations',
  'systemIntegrationsRelations',
  'companyCashLedgerRelations',
  'systemLlmDefaultsRelations',
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

// Sub-schema files should export their respective tables.
const subSchemaExports: Array<{ file: string; mod: Record<string, unknown>; tables: readonly string[] }> = [
  {
    file: 'schema-agents',
    mod: agentsSchema,
    tables: ['agents', 'agentProviders', 'agentExecutionContracts', 'agentExecutionSteps',
      'agentHomeMetricSnapshots', 'agentCheckpointedOmStates', 'agentLongTermMemoryStates',
      'agentLongTermMemoryRecallStates', 'agentNotifications', 'agentSchedules'],
  },
  {
    file: 'schema-roles',
    mod: rolesSchema,
    tables: ['agentRoles', 'roleToolPermissions', 'roleWorkflowPermissions'],
  },
  {
    file: 'schema-llm',
    mod: llmSchema,
    tables: ['llmProfiles', 'llmModelPrices', 'systemLlmDefaults'],
  },
  {
    file: 'schema-finance',
    mod: financeSchema,
    tables: ['companyCashLedger', 'companyRecurringPayables'],
  },
  {
    file: 'schema-config',
    mod: configSchema,
    tables: ['systemSettings'],
  },
  {
    file: 'schema-integrations',
    mod: integrationsSchema,
    tables: ['systemIntegrations'],
  },
  {
    file: 'schema-chat',
    mod: chatSchema,
    tables: ['internalChatAccounts', 'internalChatConversations', 'internalChatConversationMembers',
      'internalChatMessages', 'internalChatMessageReads', 'internalChatMessageAttachments'],
  },
  {
    file: 'schema-mcp',
    mod: mcpSchema,
    tables: ['mcpServerConfigs', 'agentMcpConfigs'],
  },
  {
    file: 'schema-webhooks',
    mod: webhooksSchema,
    tables: ['webhookRoutes', 'webhookEvents'],
  },
  {
    file: 'schema-knowledge',
    mod: knowledgeSchema,
    tables: ['knowledgeDocuments'],
  },
  {
    file: 'schema-tickets',
    mod: ticketsSchema,
    tables: ['tickets', 'ticketMessages'],
  },
];

describe('schema.ts relations (defined in schema.ts, exported from schema.ts)', () => {
  relationExports.forEach((name) => {
    it(`${name} is exported from schema.ts`, () => {
      expect(schema).toHaveProperty(name);
    });

    it(`${name} is an object (Drizzle relation definition)`, () => {
      expect(typeof (schema as Record<string, unknown>)[name]).toBe('object');
    });
  });
});

describe('sub-schema table exports', () => {
  subSchemaExports.forEach(({ file, mod, tables }) => {
    tables.forEach((table) => {
      it(`${file}: exports ${table}`, () => {
        expect(mod).toHaveProperty(table);
        expect(typeof (mod as Record<string, unknown>)[table]).toBe('object');
      });
    });
  });
});

describe('Database type re-export', () => {
  it('Database type is re-exported from schema module', () => {
    expect(schema).toBeDefined();
  });
});
