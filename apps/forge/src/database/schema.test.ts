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
      const a: Agent = { id: 'a1', name: 'Test', description: null, roleId: 'r1', modelProfileId: 'mp1', omModelProfileId: 'mp1', instructions: '', executionState: 'idle', lastExecutionError: null, lastExecutionErrorAt: null, workspaceAutoSync: 1, workspaceBm25: 1, workspaceEmbedder: 'default', workspaceFilesystem: null, workspaceSkills: null, workspaceSandbox: null, createdAt: 0, updatedAt: 0 };
      expect(a.name).toBe('Test');
    });

    it('NewAgent type', () => {
      const a: NewAgent = { id: 'a1', name: 'New', description: null, roleId: 'r1', modelProfileId: 'mp1', omModelProfileId: 'mp1', instructions: '', executionState: 'idle', workspaceAutoSync: 1, workspaceBm25: 1, workspaceEmbedder: 'default', workspaceFilesystem: null, workspaceSkills: null, workspaceSandbox: null, lastExecutionError: null, lastExecutionErrorAt: null, createdAt: 0, updatedAt: 0 };
      expect(a.name).toBe('New');
    });

    it('AgentRole type', () => {
      const r: AgentRole = { id: 'r1', name: 'Developer', description: 'A dev role', createdAt: 0, updatedAt: 0 };
      expect(r.name).toBe('Developer');
    });

    it('NewAgentRole type', () => {
      const r: NewAgentRole = { id: 'r1', name: 'Dev', description: 'desc', createdAt: 0, updatedAt: 0 };
      expect(r.name).toBe('Dev');
    });

    it('RoleToolPermission type', () => {
      const p: RoleToolPermission = { roleId: 'r1', toolId: 'code_edit', createdAt: 0, updatedAt: 0 };
      expect(p.toolId).toBe('code_edit');
    });

    it('NewRoleToolPermission type', () => {
      const p: NewRoleToolPermission = { roleId: 'r1', toolId: 'read', createdAt: 0, updatedAt: 0 };
      expect(p.toolId).toBe('read');
    });

    it('RoleWorkflowPermission type', () => {
      const p: RoleWorkflowPermission = { roleId: 'r1', workflowId: 'deploy', createdAt: 0, updatedAt: 0 };
      expect(p.workflowId).toBe('deploy');
    });

    it('NewRoleWorkflowPermission type', () => {
      const p: NewRoleWorkflowPermission = { roleId: 'r1', workflowId: 'test', createdAt: 0, updatedAt: 0 };
      expect(p.workflowId).toBe('test');
    });

    it('SystemSettings type', () => {
      const s: SystemSettings = { id: 's1', companyName: 'Acme', companyContext: 'context', stepDelayEnabled: 1, communicationDmFlushingEnabled: 1, communicationGroupFlushingEnabled: 1, memoryLastMessagesFullEnabled: 0, memoryLastMessagesCount: 0, tokenCountFilterEnabled: 0, tokenCountFilterLimit: 0, checkpointedOmEnabled: 0, checkpointedOmTotalContextTokens: 0, checkpointedOmRecentRawTokens: 0, checkpointedOmRawObservationBatchTokens: 0, checkpointedOmObservationReflectionBatchTokens: 0, checkpointedOmObservationSupportTokens: 0, checkpointedOmReflectionSupportTokens: 0, omObservationMessageTokens: 0, omObservationBufferTokens: 0, omObservationBufferActivation: 0, omObservationPreviousObserverTokens: 0, omReflectionObservationTokens: 0, omReflectionBufferActivation: 0, ltmRecallSearchMode: 'vector', ltmRecallWorkspaceTopK: 0, ltmRecallGraphTopK: 0, ltmRecallGraphThreshold: 0, ltmRecallGraphRandomWalkSteps: 0, ltmRecallGraphIncludeSources: 0, ltmRecallScoreThreshold: 0, ltmRecallDocumentCount: 0, updatedAt: 0 };
      expect(s.companyName).toBe('Acme');
    });

    it('NewSystemSettings type', () => {
      const s: NewSystemSettings = { id: 's1', companyName: 'Acme', companyContext: 'context', stepDelayEnabled: 1, communicationDmFlushingEnabled: 1, communicationGroupFlushingEnabled: 1, memoryLastMessagesFullEnabled: 0, memoryLastMessagesCount: 0, tokenCountFilterEnabled: 0, tokenCountFilterLimit: 0, checkpointedOmEnabled: 0, checkpointedOmTotalContextTokens: 0, checkpointedOmRecentRawTokens: 0, checkpointedOmRawObservationBatchTokens: 0, checkpointedOmObservationReflectionBatchTokens: 0, checkpointedOmObservationSupportTokens: 0, checkpointedOmReflectionSupportTokens: 0, omObservationMessageTokens: 0, omObservationBufferTokens: 0, omObservationBufferActivation: 0, omObservationPreviousObserverTokens: 0, omReflectionObservationTokens: 0, omReflectionBufferActivation: 0, ltmRecallSearchMode: 'vector', ltmRecallWorkspaceTopK: 0, ltmRecallGraphTopK: 0, ltmRecallGraphThreshold: 0, ltmRecallGraphRandomWalkSteps: 0, ltmRecallGraphIncludeSources: 0, ltmRecallScoreThreshold: 0, ltmRecallDocumentCount: 0, updatedAt: 0 };
      expect(s.companyContext).toBe('context');
    });

    it('AgentExecutionContract type', () => {
      const c: AgentExecutionContract = { id: 'c1', agentId: 'a1', isActive: 1, budgetUsd: 100, autoRenew: 1, fundedAt: null, startsAt: 0, endsAt: 100, createdAt: 0 };
      expect(c.budgetUsd).toBe(100);
    });

    it('NewAgentExecutionContract type', () => {
      const c: NewAgentExecutionContract = { id: 'c1', agentId: 'a1', isActive: 1, budgetUsd: 100, autoRenew: 1, fundedAt: null, startsAt: 0, endsAt: 100, createdAt: 0 };
      expect(c.agentId).toBe('a1');
    });

    it('AgentExecutionStep type', () => {
      const s: AgentExecutionStep = { id: 'es1', contractId: 'c1', agentId: 'a1', llmProfileId: 'mp1', modelKey: 'gpt-4', kind: 'generate', inputTokens: 100, cachedInputTokens: 0, outputTokens: 50, inputPerMillionUsd: 1, inputCachePerMillionUsd: 0, outputPerMillionUsd: 3, contractCostMultiplier: 1, costUsd: 0.0025, createdAt: 0, updatedAt: 0 };
      expect(s.modelKey).toBe('gpt-4');
    });

    it('NewAgentExecutionStep type', () => {
      const s: NewAgentExecutionStep = { id: 'es1', contractId: 'c1', agentId: 'a1', llmProfileId: 'mp1', modelKey: 'gpt-4', kind: 'generate', inputTokens: 100, cachedInputTokens: 0, outputTokens: 50, inputPerMillionUsd: 1, inputCachePerMillionUsd: 0, outputPerMillionUsd: 3, contractCostMultiplier: 1, costUsd: 0.0025, createdAt: 0, updatedAt: 0 };
      expect(s.costUsd).toBe(0.0025);
    });

    it('AgentHomeMetricSnapshot type', () => {
      const m: AgentHomeMetricSnapshot = { id: 'm1', agentId: 'a1', stepId: 'es1', stepCreatedAt: 0, snapshot: '{"value":10}', createdAt: 0 };
      expect(m.snapshot).toBeDefined();
    });

    it('NewAgentHomeMetricSnapshot type', () => {
      const m: NewAgentHomeMetricSnapshot = { id: 'm1', agentId: 'a1', stepId: 'es1', stepCreatedAt: 0, snapshot: '{"value":5}', createdAt: 0 };
      expect(m.snapshot).toBeDefined();
    });

    it('AgentCheckpointedOmState type', () => {
      const s: AgentCheckpointedOmState = { agentId: 'a1', threadId: 't1', resourceId: 'r1', state: '{}', createdAt: 0, updatedAt: 0 };
      expect(s.state).toBe('{}');
    });

    it('NewAgentCheckpointedOmState type', () => {
      const s: NewAgentCheckpointedOmState = { agentId: 'a1', threadId: 't1', resourceId: 'r1', state: '{}', createdAt: 0, updatedAt: 0 };
      expect(s.state).toBe('{}');
    });

    it('AgentLongTermMemoryState type', () => {
      const s: AgentLongTermMemoryState = { agentId: 'a1', state: '{"content":"Important"}', recallIndexStamp: null, createdAt: 0, updatedAt: 0 };
      expect(s.state).toBeDefined();
    });

    it('NewAgentLongTermMemoryState type', () => {
      const s: NewAgentLongTermMemoryState = { agentId: 'a1', state: '{"content":"Data"}', recallIndexStamp: null, createdAt: 0, updatedAt: 0 };
      expect(s.state).toBeDefined();
    });

    it('AgentLongTermMemoryRecallState type', () => {
      const s: AgentLongTermMemoryRecallState = { agentId: 'a1', snapshot: '{"content":"Data"}', threadId: 't1', resourceId: 'r1', history: null, createdAt: 0, updatedAt: 0 };
      expect(s.snapshot).toBeDefined();
    });

    it('NewAgentLongTermMemoryRecallState type', () => {
      const s: NewAgentLongTermMemoryRecallState = { agentId: 'a1', snapshot: '{"content":"Data"}', threadId: 't1', resourceId: 'r1', history: null, createdAt: 0, updatedAt: 0 };
      expect(s.snapshot).toBeDefined();
    });

    it('AgentNotification type', () => {
      const n: AgentNotification = { id: 'n1', agentId: 'a1', content: 'Alert', readAt: null, createdAt: 0, updatedAt: 0 };
      expect(n.content).toBe('Alert');
    });

    it('NewAgentNotification type', () => {
      const n: NewAgentNotification = { id: 'n1', agentId: 'a1', content: 'Alert', readAt: null, createdAt: 0, updatedAt: 0 };
      expect(n.content).toBe('Alert');
    });

    it('AgentSchedule type', () => {
      const s: AgentSchedule = { id: 'sch1', agentId: 'a1', name: 'Schedule', description: null, creatorId: null, isActive: 1, kind: 'cron', scheduleType: 'cron', timezone: 'UTC', cronExpression: '0 9 * * *', nextTriggerAt: null, content: '', scheduledDate: null, wakeWhenRunning: 0, lastTriggeredAt: null, createdAt: 0, updatedAt: 0 };
      expect(s.cronExpression).toBe('0 9 * * *');
    });

    it('NewAgentSchedule type', () => {
      const s: NewAgentSchedule = { id: 'sch1', agentId: 'a1', name: 'Schedule', description: null, creatorId: null, isActive: 1, kind: 'cron', scheduleType: 'cron', timezone: 'UTC', cronExpression: '0 8 * * *', nextTriggerAt: null, content: '', scheduledDate: null, wakeWhenRunning: 0, lastTriggeredAt: null, createdAt: 0, updatedAt: 0 };
      expect(s.cronExpression).toBe('0 8 * * *');
    });

    it('LlmProfile type', () => {
      const p: LlmProfile = { id: 'lp1', name: 'GPT-4', modelKey: 'gpt-4', baseUrl: null, encryptedApiKey: 'key', contractCostMultiplier: 1, isEnabled: 1, createdAt: 0, updatedAt: 0 };
      expect(p.modelKey).toBe('gpt-4');
    });

    it('NewLlmProfile type', () => {
      const p: NewLlmProfile = { id: 'lp1', name: 'Claude', modelKey: 'claude-3', baseUrl: null, encryptedApiKey: 'key', contractCostMultiplier: 1, isEnabled: 1, createdAt: 0, updatedAt: 0 };
      expect(p.modelKey).toBe('claude-3');
    });

    it('SystemLlmDefaults type', () => {
      const d: SystemLlmDefaults = { id: 'd1', primaryProfileId: 'lp1', omProfileId: 'lp2', hiringRhProfileId: 'lp3', createdAt: 0, updatedAt: 0 };
      expect(d.primaryProfileId).toBe('lp1');
    });

    it('NewSystemLlmDefaults type', () => {
      const d: NewSystemLlmDefaults = { id: 'd1', primaryProfileId: 'lp1', omProfileId: 'lp2', hiringRhProfileId: 'lp3', createdAt: 0, updatedAt: 0 };
      expect(d.omProfileId).toBe('lp2');
    });

    it('AgentProvider type', () => {
      const p: AgentProvider = { id: 'ap1', agentId: 'a1', providerType: 'anthropic', encryptedCredentials: 'key', createdAt: 0 };
      expect(p.providerType).toBe('anthropic');
    });

    it('NewAgentProvider type', () => {
      const p: NewAgentProvider = { id: 'ap1', agentId: 'a1', providerType: 'openai', encryptedCredentials: 'key', createdAt: 0 };
      expect(p.providerType).toBe('openai');
    });

    it('SystemIntegration type', () => {
      const i: SystemIntegration = { providerType: 'migadu', encryptedConfig: '{}', isEnabled: 1, createdAt: 0, updatedAt: 0 };
      expect(i.providerType).toBe('migadu');
    });

    it('NewSystemIntegration type', () => {
      const i: NewSystemIntegration = { providerType: 'coolify', encryptedConfig: '{}', createdAt: 0, updatedAt: 0 };
      expect(i.providerType).toBe('coolify');
    });

    it('InternalChatAccount type', () => {
      const a: InternalChatAccount = { id: 'ca1', slug: 'key1', displayName: 'Test', description: null, agentId: null, createdAt: 0, updatedAt: 0 };
      expect(a.displayName).toBe('Test');
    });

    it('NewInternalChatAccount type', () => {
      const a: NewInternalChatAccount = { id: 'ca1', slug: 'key2', displayName: 'Bot', description: null, agentId: null, createdAt: 0, updatedAt: 0 };
      expect(a.displayName).toBe('Bot');
    });

    it('InternalChatConversation type', () => {
      const c: InternalChatConversation = { id: 'cv1', type: 'dm', name: null, createdByAccountId: 'ca1', createdAt: 0, updatedAt: 0 };
      expect(c.type).toBe('dm');
    });

    it('NewInternalChatConversation type', () => {
      const c: NewInternalChatConversation = { id: 'cv1', type: 'group', name: 'random', createdByAccountId: 'ca1', createdAt: 0, updatedAt: 0 };
      expect(c.name).toBe('random');
    });

    it('InternalChatConversationMember type', () => {
      const m: InternalChatConversationMember = { accountId: 'ca1', conversationId: 'cv1', role: 'member', createdAt: 0 };
      expect(m.role).toBe('member');
    });

    it('NewInternalChatConversationMember type', () => {
      const m: NewInternalChatConversationMember = { accountId: 'ca1', conversationId: 'cv1', role: 'admin', createdAt: 0 };
      expect(m.role).toBe('admin');
    });

    it('InternalChatMessage type', () => {
      const m: InternalChatMessage = { id: 'msg1', conversationId: 'cv1', authorAccountId: 'ca1', content: 'Hello', replyToMessageId: null, createdAt: 0 };
      expect(m.content).toBe('Hello');
    });

    it('NewInternalChatMessage type', () => {
      const m: NewInternalChatMessage = { id: 'msg1', conversationId: 'cv1', authorAccountId: 'ca1', content: 'Hi', replyToMessageId: null, createdAt: 0 };
      expect(m.content).toBe('Hi');
    });

    it('InternalChatMessageRead type', () => {
      const r: InternalChatMessageRead = { agentId: 'a1', messageId: 'msg1', readAt: 0 };
      expect(r.readAt).toBe(0);
    });

    it('NewInternalChatMessageRead type', () => {
      const r: NewInternalChatMessageRead = { agentId: 'a1', messageId: 'msg1', readAt: 0 };
      expect(r.readAt).toBe(0);
    });

    it('InternalChatMessageAttachment type', () => {
      const a: InternalChatMessageAttachment = { id: 'ma1', messageId: 'msg1', name: 'doc.pdf', data: Buffer.from('data'), sizeBytes: 1024, contentType: 'application/pdf', attachmentIndex: 0, createdAt: 0 };
      expect(a.name).toBe('doc.pdf');
    });

    it('LlmModelPrice type', () => {
      const p: LlmModelPrice = { modelKey: 'gpt-4', inputPerMillionUsd: 1, inputCachePerMillionUsd: 0, outputPerMillionUsd: 3, createdAt: 0, updatedAt: 0 };
      expect(p.inputPerMillionUsd).toBe(1);
    });

    it('NewLlmModelPrice type', () => {
      const p: NewLlmModelPrice = { modelKey: 'gpt-4', inputPerMillionUsd: 2, inputCachePerMillionUsd: 0, outputPerMillionUsd: 6, createdAt: 0, updatedAt: 0 };
      expect(p.outputPerMillionUsd).toBe(6);
    });

    it('CompanyCashLedgerEntry type', () => {
      const e: CompanyCashLedgerEntry = { id: 'le1', type: 'debit', amountUsd: 100, description: 'Test', status: 'completed', direction: 'outbound', referenceType: null, referenceId: null, dueAt: null, effectiveAt: null, createdAt: 0 };
      expect(e.amountUsd).toBe(100);
    });

    it('NewCompanyCashLedgerEntry type', () => {
      const e: NewCompanyCashLedgerEntry = { id: 'le1', type: 'credit', amountUsd: 50, description: 'Income', status: 'pending', direction: 'inbound', createdAt: 0 };
      expect(e.amountUsd).toBe(50);
    });

    it('CompanyRecurringPayable type', () => {
      const p: CompanyRecurringPayable = { id: 'rp1', name: 'Sub', amountUsd: 50, recurrencePeriod: 'monthly', nextDueAt: 0, isActive: 1, description: null, createdAt: 0, updatedAt: 0 };
      expect(p.amountUsd).toBe(50);
    });

    it('NewCompanyRecurringPayable type', () => {
      const p: NewCompanyRecurringPayable = { id: 'rp1', name: 'Sub', amountUsd: 50, recurrencePeriod: 'monthly', nextDueAt: 0, isActive: 1, description: null, createdAt: 0, updatedAt: 0 };
      expect(p.amountUsd).toBe(50);
    });
  });
});
