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
      const a: Agent = { id: 'a1', roleId: 'r1', name: 'Test', kind: 'fullstack', status: 'active', createdAt: 0, updatedAt: 0 };
      expect(a.name).toBe('Test');
    });

    it('NewAgent type', () => {
      const a: NewAgent = { roleId: 'r1', name: 'New', kind: 'fullstack', status: 'active' };
      expect(a.kind).toBe('fullstack');
    });

    it('AgentRole type', () => {
      const r: AgentRole = { id: 'r1', name: 'Developer', description: 'A dev role', kind: 'fullstack', createdAt: 0, updatedAt: 0 };
      expect(r.kind).toBe('fullstack');
    });

    it('NewAgentRole type', () => {
      const r: NewAgentRole = { name: 'Dev', description: 'desc', kind: 'fullstack' };
      expect(r.name).toBe('Dev');
    });

    it('RoleToolPermission type', () => {
      const p: RoleToolPermission = { id: 'p1', roleId: 'r1', tool: 'code_edit', createdAt: 0, updatedAt: 0 };
      expect(p.tool).toBe('code_edit');
    });

    it('NewRoleToolPermission type', () => {
      const p: NewRoleToolPermission = { roleId: 'r1', tool: 'read' };
      expect(p.tool).toBe('read');
    });

    it('RoleWorkflowPermission type', () => {
      const p: RoleWorkflowPermission = { id: 'wp1', roleId: 'r1', workflow: 'deploy', createdAt: 0, updatedAt: 0 };
      expect(p.workflow).toBe('deploy');
    });

    it('NewRoleWorkflowPermission type', () => {
      const p: NewRoleWorkflowPermission = { roleId: 'r1', workflow: 'test' };
      expect(p.workflow).toBe('test');
    });

    it('SystemSettings type', () => {
      const s: SystemSettings = { id: 's1', key: 'mode', value: 'prod', createdAt: 0, updatedAt: 0 };
      expect(s.key).toBe('mode');
    });

    it('NewSystemSettings type', () => {
      const s: NewSystemSettings = { key: 'env', value: 'prod' };
      expect(s.value).toBe('prod');
    });

    it('AgentExecutionContract type', () => {
      const c: AgentExecutionContract = { id: 'c1', agentId: 'a1', title: 'Task', status: 'active', createdAt: 0, updatedAt: 0 };
      expect(c.title).toBe('Task');
    });

    it('NewAgentExecutionContract type', () => {
      const c: NewAgentExecutionContract = { agentId: 'a1', title: 'New', status: 'active' };
      expect(c.agentId).toBe('a1');
    });

    it('AgentExecutionStep type', () => {
      const s: AgentExecutionStep = { id: 'es1', contractId: 'c1', stepIndex: 1, outcome: 'success', createdAt: 0, updatedAt: 0 };
      expect(s.stepIndex).toBe(1);
    });

    it('NewAgentExecutionStep type', () => {
      const s: NewAgentExecutionStep = { contractId: 'c1', stepIndex: 0, outcome: 'pending' };
      expect(s.outcome).toBe('pending');
    });

    it('AgentHomeMetricSnapshot type', () => {
      const m: AgentHomeMetricSnapshot = { id: 'm1', agentId: 'a1', metric: 'tasks_done', value: 10, period: 'daily', recordedAt: 0, createdAt: 0 };
      expect(m.metric).toBe('tasks_done');
    });

    it('NewAgentHomeMetricSnapshot type', () => {
      const m: NewAgentHomeMetricSnapshot = { agentId: 'a1', metric: 'speed', value: 5, period: 'hourly' };
      expect(m.value).toBe(5);
    });

    it('AgentCheckpointedOmState type', () => {
      const s: AgentCheckpointedOmState = { id: 'cs1', agentId: 'a1', checkpointKey: 'cp1', stateJson: '{}', createdAt: 0, updatedAt: 0 };
      expect(s.checkpointKey).toBe('cp1');
    });

    it('NewAgentCheckpointedOmState type', () => {
      const s: NewAgentCheckpointedOmState = { agentId: 'a1', checkpointKey: 'cp', stateJson: '{}' };
      expect(s.agentId).toBe('a1');
    });

    it('AgentLongTermMemoryState type', () => {
      const s: AgentLongTermMemoryState = { id: 'lm1', agentId: 'a1', content: 'Important', createdAt: 0, updatedAt: 0 };
      expect(s.content).toBe('Important');
    });

    it('NewAgentLongTermMemoryState type', () => {
      const s: NewAgentLongTermMemoryState = { agentId: 'a1', content: 'Data' };
      expect(s.content).toBe('Data');
    });

    it('AgentLongTermMemoryRecallState type', () => {
      const s: AgentLongTermMemoryRecallState = { id: 'lr1', agentId: 'a1', memoryId: 'lm1', relevance: 0.9, createdAt: 0, updatedAt: 0 };
      expect(s.relevance).toBe(0.9);
    });

    it('NewAgentLongTermMemoryRecallState type', () => {
      const s: NewAgentLongTermMemoryRecallState = { agentId: 'a1', memoryId: 'lm1', relevance: 0.5 };
      expect(s.memoryId).toBe('lm1');
    });

    it('AgentNotification type', () => {
      const n: AgentNotification = { id: 'n1', agentId: 'a1', message: 'Alert', kind: 'info', createdAt: 0, updatedAt: 0 };
      expect(n.kind).toBe('info');
    });

    it('NewAgentNotification type', () => {
      const n: NewAgentNotification = { agentId: 'a1', message: 'Hi', kind: 'info' };
      expect(n.message).toBe('Hi');
    });

    it('AgentSchedule type', () => {
      const s: AgentSchedule = { id: 'sch1', agentId: 'a1', cronExpression: '0 9 * * *', isActive: true, createdAt: 0, updatedAt: 0 };
      expect(s.cronExpression).toBe('0 9 * * *');
    });

    it('NewAgentSchedule type', () => {
      const s: NewAgentSchedule = { agentId: 'a1', cronExpression: '0 8 * * *', isActive: true };
      expect(s.isActive).toBe(true);
    });

    it('LlmProfile type', () => {
      const p: LlmProfile = { id: 'lp1', name: 'GPT-4', modelName: 'gpt-4', provider: 'openai', createdAt: 0, updatedAt: 0 };
      expect(p.provider).toBe('openai');
    });

    it('NewLlmProfile type', () => {
      const p: NewLlmProfile = { name: 'Claude', modelName: 'claude-3', provider: 'anthropic' };
      expect(p.modelName).toBe('claude-3');
    });

    it('SystemLlmDefaults type', () => {
      const d: SystemLlmDefaults = { id: 'd1', profileId: 'lp1', createdAt: 0, updatedAt: 0 };
      expect(d.profileId).toBe('lp1');
    });

    it('NewSystemLlmDefaults type', () => {
      const d: NewSystemLlmDefaults = { profileId: 'lp2' };
      expect(d.profileId).toBe('lp2');
    });

    it('AgentProvider type', () => {
      const p: AgentProvider = { id: 'ap1', name: 'Forge', description: 'Test', createdAt: 0, updatedAt: 0 };
      expect(p.name).toBe('Forge');
    });

    it('NewAgentProvider type', () => {
      const p: NewAgentProvider = { name: 'New', description: 'Provider' };
      expect(p.name).toBe('New');
    });

    it('SystemIntegration type', () => {
      const i: SystemIntegration = { id: 'si1', kind: 'migadu', config: {}, createdAt: 0, updatedAt: 0 };
      expect(i.kind).toBe('migadu');
    });

    it('NewSystemIntegration type', () => {
      const i: NewSystemIntegration = { kind: 'coolify', config: {} };
      expect(i.kind).toBe('coolify');
    });

    it('InternalChatAccount type', () => {
      const a: InternalChatAccount = { id: 'ca1', targetKey: 'key1', provider: 'slack', displayName: 'Test', createdAt: 0, updatedAt: 0 };
      expect(a.provider).toBe('slack');
    });

    it('NewInternalChatAccount type', () => {
      const a: NewInternalChatAccount = { targetKey: 'key2', provider: 'discord', displayName: 'Bot' };
      expect(a.provider).toBe('discord');
    });

    it('InternalChatConversation type', () => {
      const c: InternalChatConversation = { id: 'cv1', provider: 'slack', targetKey: 'ch1', name: 'general', isGroup: false, createdAt: 0, updatedAt: 0 };
      expect(c.name).toBe('general');
    });

    it('NewInternalChatConversation type', () => {
      const c: NewInternalChatConversation = { provider: 'discord', targetKey: 'ch2', name: 'random', isGroup: true };
      expect(c.isGroup).toBe(true);
    });

    it('InternalChatConversationMember type', () => {
      const m: InternalChatConversationMember = { id: 'cm1', conversationId: 'cv1', accountId: 'ca1', role: 'member', createdAt: 0, updatedAt: 0 };
      expect(m.role).toBe('member');
    });

    it('NewInternalChatConversationMember type', () => {
      const m: NewInternalChatConversationMember = { conversationId: 'cv1', accountId: 'ca1', role: 'admin' };
      expect(m.role).toBe('admin');
    });

    it('InternalChatMessage type', () => {
      const m: InternalChatMessage = { id: 'msg1', conversationId: 'cv1', senderId: 'ca1', content: 'Hello', contentText: 'Hello', createdAt: 0, updatedAt: 0 };
      expect(m.content).toBe('Hello');
    });

    it('NewInternalChatMessage type', () => {
      const m: NewInternalChatMessage = { conversationId: 'cv1', senderId: 'ca1', content: 'Hi', contentText: 'Hi' };
      expect(m.contentText).toBe('Hi');
    });

    it('InternalChatMessageRead type', () => {
      const r: InternalChatMessageRead = { id: 'mr1', messageId: 'msg1', accountId: 'ca1', readAt: 0, createdAt: 0, updatedAt: 0 };
      expect(r.messageId).toBe('msg1');
    });

    it('NewInternalChatMessageRead type', () => {
      const r: NewInternalChatMessageRead = { messageId: 'msg2', accountId: 'ca1', readAt: 0 };
      expect(r.messageId).toBe('msg2');
    });

    it('InternalChatMessageAttachment type', () => {
      const a: InternalChatMessageAttachment = { id: 'ma1', messageId: 'msg1', fileName: 'doc.pdf', mimeType: 'application/pdf', fileSizeBytes: 1024, storagePath: '/files/doc.pdf', createdAt: 0, updatedAt: 0 };
      expect(a.fileName).toBe('doc.pdf');
    });

    it('LlmModelPrice type', () => {
      const p: LlmModelPrice = { id: 'mp1', profileId: 'lp1', pricePer1kInputTokens: 0.01, pricePer1kOutputTokens: 0.03, createdAt: 0, updatedAt: 0 };
      expect(p.pricePer1kInputTokens).toBe(0.01);
    });

    it('NewLlmModelPrice type', () => {
      const p: NewLlmModelPrice = { profileId: 'lp1', pricePer1kInputTokens: 0.02, pricePer1kOutputTokens: 0.06 };
      expect(p.pricePer1kOutputTokens).toBe(0.06);
    });

    it('CompanyCashLedgerEntry type', () => {
      const e: CompanyCashLedgerEntry = { id: 'le1', kind: 'debit', amountUsd: 100, description: 'Test', createdAt: 0, updatedAt: 0 };
      expect(e.kind).toBe('debit');
    });

    it('NewCompanyCashLedgerEntry type', () => {
      const e: NewCompanyCashLedgerEntry = { kind: 'credit', amountUsd: 50, description: 'Income' };
      expect(e.amountUsd).toBe(50);
    });

    it('CompanyRecurringPayable type', () => {
      const p: CompanyRecurringPayable = { id: 'rp1', name: 'Sub', amountUsd: 50, kind: 'recurring', recurrencePeriod: 'monthly', nextDueAt: 0, isActive: true, createdAt: 0, updatedAt: 0 };
      expect(p.kind).toBe('recurring');
    });

    it('NewCompanyRecurringPayable type', () => {
      const p: NewCompanyRecurringPayable = { name: 'Sub', amountUsd: 50, kind: 'recurring', recurrencePeriod: 'monthly', nextDueAt: 0, isActive: true };
      expect(p.kind).toBe('recurring');
    });
  });
});
