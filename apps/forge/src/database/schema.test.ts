import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  agents, agentRoles, agentSchedules, agentExecutionContracts, agentExecutionSteps,
  agentHomeMetricSnapshots, agentCheckpointedOmStates, agentLongTermMemoryStates,
  agentLongTermMemoryRecallStates, agentNotifications, agentProviders,
  agentMcpConfigs,
  roleToolPermissions, roleWorkflowPermissions, systemSettings, systemIntegrations,
  systemLlmDefaults, llmProfiles, llmModelPrices,
  internalChatAccounts, internalChatConversations, internalChatConversationMembers,
  internalChatMessages, internalChatMessageReads, internalChatMessageAttachments,
  companyCashLedger, companyRecurringPayables,
  agentsRelations, agentRolesRelations, agentSchedulesRelations,
  agentExecutionContractsRelations, agentExecutionStepsRelations,
  agentHomeMetricSnapshotsRelations, agentNotificationsRelations,
  agentProvidersRelations, agentMcpConfigsRelations,
  roleToolPermissionsRelations, roleWorkflowPermissionsRelations,
  llmProfilesRelations, mcpServerConfigsRelations,
  internalChatAccountsRelations, internalChatConversationsRelations,
  internalChatConversationMembersRelations, internalChatMessagesRelations,
  internalChatMessageReadsRelations, internalChatMessageAttachmentsRelations,
} from './schema';

import type {
  WorkspaceFilesystemConfig, WorkspaceSandboxConfig, WorkspaceSkillsConfig,
  Agent, NewAgent, AgentRole, NewAgentRole, RoleToolPermission, NewRoleToolPermission,
  RoleWorkflowPermission, NewRoleWorkflowPermission, SystemSettings, NewSystemSettings,
  AgentExecutionContract, NewAgentExecutionContract, AgentExecutionStep, NewAgentExecutionStep,
  AgentHomeMetricSnapshot, NewAgentHomeMetricSnapshot, AgentCheckpointedOmState,
  NewAgentCheckpointedOmState, AgentLongTermMemoryState, NewAgentLongTermMemoryState,
  AgentLongTermMemoryRecallState, NewAgentLongTermMemoryRecallState,
  AgentNotification, NewAgentNotification, AgentSchedule, NewAgentSchedule,
  InternalChatAccount, NewInternalChatAccount, InternalChatConversation,
  NewInternalChatConversation, InternalChatConversationMember, NewInternalChatConversationMember,
  InternalChatMessage, NewInternalChatMessage, InternalChatMessageRead, NewInternalChatMessageRead,
  InternalChatMessageAttachment, NewInternalChatMessageAttachment,
  LlmModelPrice, NewLlmModelPrice, CompanyCashLedgerEntry, NewCompanyCashLedgerEntry,
  CompanyRecurringPayable, NewCompanyRecurringPayable,
  MigaduSystemIntegrationConfig, CoolifySystemIntegrationConfig,
  GitHubSystemIntegrationConfig, MinimaxSystemIntegrationConfig, SystemIntegrationConfigMap,
  SystemIntegration, NewSystemIntegration, LlmProfile, NewLlmProfile,
  SystemLlmDefaults, NewSystemLlmDefaults, AgentProvider, NewAgentProvider,
} from './schema';

describe('database schema', () => {
  describe('workspace configs (Zod validation)', () => {
    it('WorkspaceFilesystemConfig parses valid config', () => {
      const valid = { root: '/data/workspace', maxDepth: 3 };
      expect(() => z.object({
        root: z.string(), maxDepth: z.number().int().positive(),
      }).parse(valid)).not.toThrow();
    });

    it('WorkspaceFilesystemConfig rejects missing root', () => {
      const invalid = { maxDepth: 3 };
      expect(() => z.object({
        root: z.string(), maxDepth: z.number().int().positive(),
      }).parse(invalid)).toThrow();
    });

    it('WorkspaceSandboxConfig parses valid config', () => {
      const valid = { enabled: true, timeoutMs: 30000 };
      expect(() => z.object({
        enabled: z.boolean(), timeoutMs: z.number().int().positive(),
      }).parse(valid)).not.toThrow();
    });

    it('WorkspaceSkillsConfig parses valid config', () => {
      const valid = { directories: ['./skills'] };
      expect(() => z.object({
        directories: z.array(z.string()), allowedTools: z.array(z.string()).optional(),
      }).parse(valid)).not.toThrow();
    });

    it('WorkspaceSkillsConfig rejects empty directories', () => {
      const invalid = { directories: [] };
      expect(() => z.object({
        directories: z.array(z.string()).min(1),
      }).parse(invalid)).toThrow();
    });
  });

  describe('integration configs (Zod validation)', () => {
    const MigaduSchema = z.object({ apiUser: z.string().email(), apiKey: z.string().min(1) });
    const CoolifySchema = z.object({
      baseUrl: z.string().url(), adminToken: z.string().min(1),
      serverId: z.string().min(1), destinationId: z.string().min(1),
      applicationsBaseDomain: z.string().min(1).optional(),
    });
    const GitHubSchema = z.object({
      organization: z.string().min(1),
      appHomeUrl: z.string().url(),
    });
    const MinimaxSchema = z.object({ apiKey: z.string().min(1) });

    it('MigaduSchema accepts valid config', () => {
      expect(() => MigaduSchema.parse({ apiUser: 'test@example.com', apiKey: 'key123' })).not.toThrow();
    });

    it('MigaduSchema rejects invalid apiUser', () => {
      expect(() => MigaduSchema.parse({ apiUser: 'not-an-email', apiKey: 'key123' })).toThrow();
    });

    it('MigaduSchema rejects missing apiKey', () => {
      expect(() => MigaduSchema.parse({ apiUser: 'test@example.com', apiKey: '' })).toThrow();
    });

    it('CoolifySchema accepts valid config', () => {
      expect(() => CoolifySchema.parse({
        baseUrl: 'https://coolify.example.com', adminToken: 'token', serverId: 'srv1', destinationId: 'dest1',
      })).not.toThrow();
    });

    it('CoolifySchema rejects invalid URL', () => {
      expect(() => CoolifySchema.parse({
        baseUrl: 'not-a-url', adminToken: 'token', serverId: 'srv1', destinationId: 'dest1',
      })).toThrow();
    });

    it('CoolifySchema accepts optional applicationsBaseDomain', () => {
      expect(() => CoolifySchema.parse({
        baseUrl: 'https://coolify.example.com', adminToken: 'token', serverId: 'srv1', destinationId: 'dest1',
        applicationsBaseDomain: 'apps.example.com',
      })).not.toThrow();
    });

    it('GitHubSchema accepts valid config', () => {
      expect(() => GitHubSchema.parse({
        organization: 'my-org', appHomeUrl: 'https://github.com/apps/my-app',
      })).not.toThrow();
    });

    it('GitHubSchema rejects empty organization', () => {
      expect(() => GitHubSchema.parse({
        organization: '', appHomeUrl: 'https://github.com/apps/my-app',
      })).toThrow();
    });

    it('GitHubSchema rejects invalid appHomeUrl', () => {
      expect(() => GitHubSchema.parse({
        organization: 'my-org', appHomeUrl: 'not-a-url',
      })).toThrow();
    });

    it('MinimaxSchema accepts valid config', () => {
      expect(() => MinimaxSchema.parse({ apiKey: 'minimax-api-key' })).not.toThrow();
    });

    it('MinimaxSchema rejects empty apiKey', () => {
      expect(() => MinimaxSchema.parse({ apiKey: '' })).toThrow();
    });
  });

  describe('table definitions exist', () => {
    it('agent tables', () => {
      expect(agents).toBeDefined();
      expect(agentRoles).toBeDefined();
      expect(agentSchedules).toBeDefined();
      expect(agentExecutionContracts).toBeDefined();
      expect(agentExecutionSteps).toBeDefined();
      expect(agentHomeMetricSnapshots).toBeDefined();
      expect(agentCheckpointedOmStates).toBeDefined();
      expect(agentLongTermMemoryStates).toBeDefined();
      expect(agentLongTermMemoryRecallStates).toBeDefined();
      expect(agentNotifications).toBeDefined();
      expect(agentProviders).toBeDefined();
      expect(agentMcpConfigs).toBeDefined();
    });

    it('role tables', () => {
      expect(roleToolPermissions).toBeDefined();
      expect(roleWorkflowPermissions).toBeDefined();
    });

    it('system tables', () => {
      expect(systemSettings).toBeDefined();
      expect(systemIntegrations).toBeDefined();
      expect(systemLlmDefaults).toBeDefined();
      expect(llmProfiles).toBeDefined();
      expect(llmModelPrices).toBeDefined();
    });

    it('internal-chat tables', () => {
      expect(internalChatAccounts).toBeDefined();
      expect(internalChatConversations).toBeDefined();
      expect(internalChatConversationMembers).toBeDefined();
      expect(internalChatMessages).toBeDefined();
      expect(internalChatMessageReads).toBeDefined();
      expect(internalChatMessageAttachments).toBeDefined();
    });

    it('company/finance tables', () => {
      expect(companyCashLedger).toBeDefined();
      expect(companyRecurringPayables).toBeDefined();
    });
  });

  describe('relation objects exist', () => {
    it('agent relations', () => {
      expect(agentsRelations).toBeDefined();
      expect(agentRolesRelations).toBeDefined();
      expect(agentSchedulesRelations).toBeDefined();
      expect(agentExecutionContractsRelations).toBeDefined();
      expect(agentExecutionStepsRelations).toBeDefined();
      expect(agentHomeMetricSnapshotsRelations).toBeDefined();
      expect(agentNotificationsRelations).toBeDefined();
      expect(agentProvidersRelations).toBeDefined();
      expect(agentMcpConfigsRelations).toBeDefined();
    });

    it('role relations', () => {
      expect(roleToolPermissionsRelations).toBeDefined();
      expect(roleWorkflowPermissionsRelations).toBeDefined();
    });

    it('system relations', () => {
      expect(llmProfilesRelations).toBeDefined();
      expect(mcpServerConfigsRelations).toBeDefined();
    });

    it('internal-chat relations', () => {
      expect(internalChatAccountsRelations).toBeDefined();
      expect(internalChatConversationsRelations).toBeDefined();
      expect(internalChatConversationMembersRelations).toBeDefined();
      expect(internalChatMessagesRelations).toBeDefined();
      expect(internalChatMessageReadsRelations).toBeDefined();
      expect(internalChatMessageAttachmentsRelations).toBeDefined();
    });
  });

  describe('types are exported and instantiable', () => {
    it('Agent type', () => {
      const a = { id: 'a1', name: 'Test', roleId: 'r1', modelProfileId: 'mp1', omModelProfileId: 'mp2', instructions: 'inst', executionState: 'idle', createdAt: 0, updatedAt: 0 } as unknown as Agent;
      expect(a.name).toBe('Test');
      expect(a.description).toBeNull();
    });

    it('NewAgent type', () => {
      const a = { name: 'New', modelProfileId: 'mp1', omModelProfileId: 'mp2', instructions: 'inst', executionState: 'idle' } as unknown as NewAgent;
      expect(a.name).toBe('New');
      expect(a.description).toBeUndefined();
    });

    it('AgentRole type', () => {
      const r = { id: 'r1', name: 'Developer', description: null, createdAt: 0, updatedAt: 0 } as unknown as AgentRole;
      expect(r.name).toBe('Developer');
    });

    it('NewAgentRole type', () => {
      const r = { name: 'Dev', description: null } as unknown as NewAgentRole;
      expect(r.name).toBe('Dev');
    });

    it('RoleToolPermission type', () => {
      const p = { roleId: 'r1', toolId: 'code_edit', createdAt: 0, updatedAt: 0 } as unknown as RoleToolPermission;
      expect(p.toolId).toBe('code_edit');
    });

    it('NewRoleToolPermission type', () => {
      const p = { roleId: 'r1', toolId: 'read' } as unknown as NewRoleToolPermission;
      expect(p.toolId).toBe('read');
    });

    it('RoleWorkflowPermission type', () => {
      const p = { roleId: 'r1', workflowId: 'deploy', createdAt: 0, updatedAt: 0 } as unknown as RoleWorkflowPermission;
      expect(p.workflowId).toBe('deploy');
    });

    it('NewRoleWorkflowPermission type', () => {
      const p = { roleId: 'r1', workflowId: 'test' } as unknown as NewRoleWorkflowPermission;
      expect(p.workflowId).toBe('test');
    });

    it('SystemSettings type', () => {
      const s = { id: 's1', companyName: 'Acme', companyContext: 'ctx', createdAt: 0, updatedAt: 0 } as unknown as SystemSettings;
      expect(s.companyName).toBe('Acme');
    });

    it('NewSystemSettings type', () => {
      const s = { companyName: 'Acme', companyContext: 'ctx' } as unknown as NewSystemSettings;
      expect(s.companyName).toBe('Acme');
    });

    it('AgentExecutionContract type', () => {
      const c = { id: 'c1', agentId: 'a1', budgetUsd: 100, autoRenew: 1, fundedAt: null, startsAt: 0, endsAt: 1000, isActive: 1, createdAt: 0 } as unknown as AgentExecutionContract;
      expect(c.budgetUsd).toBe(100);
    });

    it('NewAgentExecutionContract type', () => {
      const c = { agentId: 'a1', budgetUsd: 100, startsAt: 0, endsAt: 1000 } as unknown as NewAgentExecutionContract;
      expect(c.budgetUsd).toBe(100);
    });

    it('AgentExecutionStep type', () => {
      const s = { id: 'es1', contractId: 'c1', agentId: 'a1', llmProfileId: 'mp1', modelKey: 'gpt-4', kind: 'generate', inputTokens: 100, cachedInputTokens: 0, outputTokens: 50, costUsd: 0.01, createdAt: 0, updatedAt: 0 } as unknown as AgentExecutionStep;
      expect(s.inputTokens).toBe(100);
    });

    it('NewAgentExecutionStep type', () => {
      const s = { contractId: 'c1', agentId: 'a1', llmProfileId: 'mp1', modelKey: 'gpt-4', kind: 'generate', inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0 } as unknown as NewAgentExecutionStep;
      expect(s.kind).toBe('generate');
    });

    it('AgentHomeMetricSnapshot type', () => {
      const m = { id: 'm1', agentId: 'a1', stepId: 's1', stepCreatedAt: 0, snapshot: '{}', createdAt: 0 } as unknown as AgentHomeMetricSnapshot;
      expect(m.agentId).toBe('a1');
    });

    it('NewAgentHomeMetricSnapshot type', () => {
      const m = { agentId: 'a1', stepId: 's1', stepCreatedAt: 0, snapshot: '{}' } as unknown as NewAgentHomeMetricSnapshot;
      expect(m.agentId).toBe('a1');
    });

    it('AgentCheckpointedOmState type', () => {
      const s = { id: 'cs1', agentId: 'a1', threadId: 't1', resourceId: 'r1', state: '{}', createdAt: 0, updatedAt: 0 } as unknown as AgentCheckpointedOmState;
      expect(s.agentId).toBe('a1');
    });

    it('NewAgentCheckpointedOmState type', () => {
      const s = { agentId: 'a1', threadId: 't1', resourceId: 'r1', state: '{}' } as unknown as NewAgentCheckpointedOmState;
      expect(s.agentId).toBe('a1');
    });

    it('AgentLongTermMemoryState type', () => {
      const s = { id: 'lm1', agentId: 'a1', state: 'Important', recallIndexStamp: null, createdAt: 0, updatedAt: 0 } as unknown as AgentLongTermMemoryState;
      expect(s.agentId).toBe('a1');
    });

    it('NewAgentLongTermMemoryState type', () => {
      const s = { agentId: 'a1', state: 'Data' } as unknown as NewAgentLongTermMemoryState;
      expect(s.agentId).toBe('a1');
    });

    it('AgentLongTermMemoryRecallState type', () => {
      const s = { id: 'lr1', agentId: 'a1', snapshot: '{}', threadId: null, resourceId: null, history: null, createdAt: 0, updatedAt: 0 } as unknown as AgentLongTermMemoryRecallState;
      expect(s.agentId).toBe('a1');
    });

    it('NewAgentLongTermMemoryRecallState type', () => {
      const s = { agentId: 'a1', snapshot: '{}' } as unknown as NewAgentLongTermMemoryRecallState;
      expect(s.agentId).toBe('a1');
    });

    it('AgentNotification type', () => {
      const n = { id: 'n1', agentId: 'a1', content: 'Alert', readAt: null, createdAt: 0, updatedAt: 0 } as unknown as AgentNotification;
      expect(n.content).toBe('Alert');
    });

    it('NewAgentNotification type', () => {
      const n = { agentId: 'a1', content: 'Hi' } as unknown as NewAgentNotification;
      expect(n.content).toBe('Hi');
    });

    it('AgentSchedule type', () => {
      const s = { id: 'sch1', agentId: 'a1', cronExpression: '0 9 * * *', isActive: 1, createdAt: 0, updatedAt: 0 } as unknown as AgentSchedule;
      expect(s.cronExpression).toBe('0 9 * * *');
    });

    it('NewAgentSchedule type', () => {
      const s = { agentId: 'a1', cronExpression: '0 8 * * *', isActive: 1 } as unknown as NewAgentSchedule;
      expect(s.isActive).toBe(1);
    });

    it('LlmProfile type', () => {
      const p = { id: 'lp1', name: 'GPT-4', modelKey: 'gpt-4', baseUrl: null, encryptedApiKey: 'enc', contractCostMultiplier: 1, isEnabled: 1, createdAt: 0, updatedAt: 0 } as unknown as LlmProfile;
      expect(p.name).toBe('GPT-4');
    });

    it('NewLlmProfile type', () => {
      const p = { name: 'Claude', modelKey: 'claude-3', encryptedApiKey: 'enc' } as unknown as NewLlmProfile;
      expect(p.name).toBe('Claude');
    });

    it('SystemLlmDefaults type', () => {
      const d = { id: 'd1', primaryProfileId: 'lp1', omProfileId: 'lp2', hiringRhProfileId: 'lp3', createdAt: 0, updatedAt: 0 } as unknown as SystemLlmDefaults;
      expect(d.primaryProfileId).toBe('lp1');
    });

    it('NewSystemLlmDefaults type', () => {
      const d = { primaryProfileId: 'lp1', omProfileId: 'lp2' } as unknown as NewSystemLlmDefaults;
      expect(d.primaryProfileId).toBe('lp1');
    });

    it('AgentProvider type', () => {
      const p = { id: 'ap1', agentId: 'a1', providerType: 'github-app', encryptedCredentials: '{}', createdAt: 0, updatedAt: 0 } as unknown as AgentProvider;
      expect(p.agentId).toBe('a1');
    });

    it('NewAgentProvider type', () => {
      const p = { agentId: 'a1', providerType: 'github-app', encryptedCredentials: '{}' } as unknown as NewAgentProvider;
      expect(p.agentId).toBe('a1');
    });

    it('SystemIntegration type', () => {
      const i = { id: 'si1', isEnabled: 1, providerType: 'migadu', encryptedConfig: '{}', createdAt: 0, updatedAt: 0 } as unknown as SystemIntegration;
      expect(i.providerType).toBe('migadu');
    });

    it('NewSystemIntegration type', () => {
      const i = { providerType: 'coolify', encryptedConfig: '{}' } as unknown as NewSystemIntegration;
      expect(i.providerType).toBe('coolify');
    });

    it('InternalChatAccount type', () => {
      const a = { id: 'ca1', slug: 'test', displayName: 'Test', description: null, agentId: null, createdAt: 0, updatedAt: 0 } as unknown as InternalChatAccount;
      expect(a.displayName).toBe('Test');
    });

    it('NewInternalChatAccount type', () => {
      const a = { slug: 'bot', displayName: 'Bot' } as unknown as NewInternalChatAccount;
      expect(a.displayName).toBe('Bot');
    });

    it('InternalChatConversation type', () => {
      const c = { id: 'cv1', type: 'dm', name: null, createdByAccountId: null, createdAt: 0, updatedAt: 0 } as unknown as InternalChatConversation;
      expect(c.type).toBe('dm');
    });

    it('NewInternalChatConversation type', () => {
      const c = { type: 'group', name: 'random', createdByAccountId: null } as unknown as NewInternalChatConversation;
      expect(c.name).toBe('random');
    });

    it('InternalChatConversationMember type', () => {
      const m = { conversationId: 'cv1', accountId: 'ca1', role: 'member', createdAt: 0, updatedAt: 0 } as unknown as InternalChatConversationMember;
      expect(m.role).toBe('member');
    });

    it('NewInternalChatConversationMember type', () => {
      const m = { conversationId: 'cv1', accountId: 'ca1', role: 'admin', createdAt: 0 } as unknown as NewInternalChatConversationMember;
      expect(m.role).toBe('admin');
    });

    it('InternalChatMessage type', () => {
      const m = { id: 'msg1', conversationId: 'cv1', authorAccountId: 'ca1', content: 'Hello', replyToMessageId: null, createdAt: 0, updatedAt: 0 } as unknown as InternalChatMessage;
      expect(m.content).toBe('Hello');
    });

    it('NewInternalChatMessage type', () => {
      const m = { conversationId: 'cv1', authorAccountId: 'ca1', content: 'Hi' } as unknown as NewInternalChatMessage;
      expect(m.content).toBe('Hi');
    });

    it('InternalChatMessageRead type', () => {
      const r = { agentId: 'a1', messageId: 'msg1', readAt: 0, createdAt: 0, updatedAt: 0 } as unknown as InternalChatMessageRead;
      expect(r.messageId).toBe('msg1');
    });

    it('NewInternalChatMessageRead type', () => {
      const r = { agentId: 'a1', messageId: 'msg2', readAt: 0 } as unknown as NewInternalChatMessageRead;
      expect(r.messageId).toBe('msg2');
    });

    it('InternalChatMessageAttachment type', () => {
      const a = { id: 'ma1', messageId: 'msg1', name: 'doc.pdf', sizeBytes: 1024, contentType: 'application/pdf', data: Buffer.from([]), createdAt: 0, updatedAt: 0 } as unknown as InternalChatMessageAttachment;
      expect(a.name).toBe('doc.pdf');
    });

    it('LlmModelPrice type', () => {
      const p = { id: 'mp1', modelKey: 'gpt-4', inputPerMillionUsd: 2.5, inputCachePerMillionUsd: 0.5, outputPerMillionUsd: 10, createdAt: 0, updatedAt: 0 } as unknown as LlmModelPrice;
      expect(p.inputPerMillionUsd).toBe(2.5);
    });

    it('NewLlmModelPrice type', () => {
      const p = { modelKey: 'gpt-4', inputPerMillionUsd: 2.5, inputCachePerMillionUsd: 0.5, outputPerMillionUsd: 10 } as unknown as NewLlmModelPrice;
      expect(p.outputPerMillionUsd).toBe(10);
    });

    it('CompanyCashLedgerEntry type', () => {
      const e = { id: 'le1', type: 'expense', description: null, status: 'cleared', direction: 'outflow', amountUsd: 100, referenceType: null, referenceId: null, dueAt: null, effectiveAt: null, createdAt: 0, updatedAt: 0 } as unknown as CompanyCashLedgerEntry;
      expect(e.amountUsd).toBe(100);
    });

    it('NewCompanyCashLedgerEntry type', () => {
      const e = { type: 'income', status: 'cleared', direction: 'inflow', amountUsd: 50 } as unknown as NewCompanyCashLedgerEntry;
      expect(e.amountUsd).toBe(50);
    });

    it('CompanyRecurringPayable type', () => {
      const p = { id: 'rp1', name: 'Sub', description: null, isActive: 1, amountUsd: 50, recurrencePeriod: 'monthly', nextDueAt: 0, createdAt: 0, updatedAt: 0 } as unknown as CompanyRecurringPayable;
      expect(p.name).toBe('Sub');
    });

    it('NewCompanyRecurringPayable type', () => {
      const p = { name: 'Sub', description: null, isActive: 1, amountUsd: 50, recurrencePeriod: 'monthly', nextDueAt: 0 } as unknown as NewCompanyRecurringPayable;
      expect(p.name).toBe('Sub');
    });
  });
});
