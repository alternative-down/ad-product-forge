import { describe, it, expect } from 'vitest';
import {
  agentIdQuerySchema,
  agentExecutionStepsQuerySchema,
  agentThreadMessagesQuerySchema,
  agentConversationMessagesQuerySchema,
  agentLongTermMemoryRecallSearchSchema,
  adminInternalChatSendSchema,
  createExternalInternalChatAccountSchema,
  updateExternalInternalChatAccountSchema,
  deleteExternalInternalChatAccountSchema,
  internalChatAccountIdQuerySchema,
  internalChatMessagesQuerySchema,
  internalChatMessageAttachmentQuerySchema,
  createInternalChatConversationSchema,
  sendInternalChatConversationMessageSchema,
  updateInternalChatConversationSchema,
  archiveInternalChatConversationSchema,
  internalChatGroupMembersQuerySchema,
  addInternalChatGroupMemberSchema,
  updateInternalChatGroupMemberRoleSchema,
  removeInternalChatGroupMemberSchema,
  hireAgentSchema,
  upsertSystemIntegrationSchema,
  createPayableSchema,
  createAgentMcpServerSchema,
} from './schemas.js';

describe('Admin Route Schemas', () => {
  describe('agentIdQuerySchema', () => {
    it('validates valid agentId', () => {
      const result = agentIdQuerySchema.parse({ agentId: 'test-agent' });
      expect(result.agentId).toBe('test-agent');
    });

    it('rejects empty agentId', () => {
      expect(() => agentIdQuerySchema.parse({ agentId: '' })).toThrow();
    });
  });

  describe('agentExecutionStepsQuerySchema', () => {
    it('applies defaults', () => {
      const result = agentExecutionStepsQuerySchema.parse({
        agentId: 'test-agent',
      });
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('respects provided values', () => {
      const result = agentExecutionStepsQuerySchema.parse({
        agentId: 'test-agent',
        limit: '50',
        offset: '10',
      });
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(10);
    });
  });

  describe('agentThreadMessagesQuerySchema', () => {
    it('applies defaults', () => {
      const result = agentThreadMessagesQuerySchema.parse({ agentId: 'agent-1' });
      expect(result.page).toBe(0);
      expect(result.perPage).toBe(20);
    });

    it('respects provided pagination values', () => {
      const result = agentThreadMessagesQuerySchema.parse({
        agentId: 'agent-1',
        page: '3',
        perPage: '50',
      });
      expect(result.page).toBe(3);
      expect(result.perPage).toBe(50);
    });

    it('rejects perPage below minimum', () => {
      expect(() =>
        agentThreadMessagesQuerySchema.parse({
          agentId: 'agent-1',
          perPage: 0,
        }),
      ).toThrow();
    });

    it('rejects perPage above maximum', () => {
      expect(() =>
        agentThreadMessagesQuerySchema.parse({
          agentId: 'agent-1',
          perPage: 200,
        }),
      ).toThrow();
    });

    it('rejects missing agentId', () => {
      expect(() => agentThreadMessagesQuerySchema.parse({})).toThrow();
    });
  });

  describe('agentConversationMessagesQuerySchema', () => {
    it('applies defaults', () => {
      const result = agentConversationMessagesQuerySchema.parse({
        agentId: 'agent-1',
        provider: 'email',
        targetKey: 'thread-abc',
      });
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('respects provided values', () => {
      const result = agentConversationMessagesQuerySchema.parse({
        agentId: 'agent-1',
        provider: 'slack',
        targetKey: 'channel-xyz',
        limit: '50',
        offset: '10',
      });
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(10);
    });

    it('rejects missing required fields', () => {
      expect(() =>
        agentConversationMessagesQuerySchema.parse({ agentId: 'agent-1' }),
      ).toThrow();
      expect(() =>
        agentConversationMessagesQuerySchema.parse({ provider: 'email' }),
      ).toThrow();
      expect(() =>
        agentConversationMessagesQuerySchema.parse({ targetKey: 't-1' }),
      ).toThrow();
    });

    it('rejects limit below minimum', () => {
      expect(() =>
        agentConversationMessagesQuerySchema.parse({
          agentId: 'agent-1',
          provider: 'email',
          targetKey: 't-1',
          limit: 0,
        }),
      ).toThrow();
    });
  });

  describe('agentLongTermMemoryRecallSearchSchema', () => {
    it('applies defaults', () => {
      const result = agentLongTermMemoryRecallSearchSchema.parse({
        agentId: 'agent-1',
        query: 'what was discussed yesterday',
      });
      expect(result.limit).toBe(10);
    });

    it('respects provided limit', () => {
      const result = agentLongTermMemoryRecallSearchSchema.parse({
        agentId: 'agent-1',
        query: 'recent decisions',
        limit: 25,
      });
      expect(result.limit).toBe(25);
    });

    it('rejects missing agentId', () => {
      expect(() =>
        agentLongTermMemoryRecallSearchSchema.parse({ query: 'test' }),
      ).toThrow();
    });

    it('rejects missing query', () => {
      expect(() =>
        agentLongTermMemoryRecallSearchSchema.parse({ agentId: 'agent-1' }),
      ).toThrow();
    });

    it('rejects empty query string', () => {
      expect(() =>
        agentLongTermMemoryRecallSearchSchema.parse({
          agentId: 'agent-1',
          query: '',
        }),
      ).toThrow();
    });
  });

  describe('hireAgentSchema', () => {
    it('validates complete input', () => {
      const result = hireAgentSchema.parse({
        hiringRequest: 'Hire a developer agent named Test Agent',
        weeklyBudgetUsd: 1000,
      });
      expect(result.hiringRequest).toBe('Hire a developer agent named Test Agent');
    });

    it('accepts optional fields', () => {
      const result = hireAgentSchema.parse({
        hiringRequest: 'Hire a developer agent',
        additionalContext: 'Be helpful',
        weeklyBudgetUsd: 1000,
      });
      expect(result.additionalContext).toBe('Be helpful');
    });
  });

  describe('upsertSystemIntegrationSchema', () => {
    it('validates migadu integration', () => {
      const result = upsertSystemIntegrationSchema.parse({
        providerType: 'migadu',
        isEnabled: true,
        config: {
          apiUser: 'test@example.com',
          apiKey: 'secret-key',
        },
      });
      expect(result.providerType).toBe('migadu');
    });

    it('validates coolify integration', () => {
      const result = upsertSystemIntegrationSchema.parse({
        providerType: 'coolify',
        isEnabled: true,
        config: {
          baseUrl: 'https://coolify.example.com',
          adminToken: 'token',
          serverId: 'srv-123',
          destinationId: 'dest-456',
        },
      });
      expect(result.providerType).toBe('coolify');
    });
  });

  describe('createPayableSchema', () => {
    it('validates agent_contract payable', () => {
      const result = createPayableSchema.parse({
        kind: 'agent_contract',
        agentId: 'agent-123',
        amount: 500,
      });
      expect(result.kind).toBe('agent_contract');
    });

    it('validates system_expense payable', () => {
      const result = createPayableSchema.parse({
        kind: 'system_expense',
        description: 'Server costs',
        amount: 100,
        category: 'infrastructure',
      });
      expect(result.kind).toBe('system_expense');
    });
  });

  describe('createAgentMcpServerSchema', () => {
    it('validates stdio transport', () => {
      const result = createAgentMcpServerSchema.parse({
        agentId: 'agent-123',
        name: 'test-mcp',
        transport: 'stdio',
        command: 'npx',
        argsText: '-v',
      });
      expect(result.transport).toBe('stdio');
    });

    it('validates http_streamable transport', () => {
      const result = createAgentMcpServerSchema.parse({
        agentId: 'agent-123',
        name: 'test-mcp',
        transport: 'http_streamable',
        url: 'https://mcp.example.com',
      });
      expect(result.transport).toBe('http_streamable');
    });
  });

  // ---------------------------------------------------------------------------
  // Internal Chat Schemas
  // ---------------------------------------------------------------------------

  describe('adminInternalChatSendSchema', () => {
    it('validates minimal required fields', () => {
      const result = adminInternalChatSendSchema.parse({
        agentId: 'agent-1',
        targetKey: 'conversation-abc',
        provider: 'email',
        content: 'Hello there',
      });
      expect(result.agentId).toBe('agent-1');
      expect(result.content).toBe('Hello there');
    });

    it('rejects missing required fields', () => {
      expect(() =>
        adminInternalChatSendSchema.parse({ agentId: 'agent-1' }),
      ).toThrow();
      expect(() =>
        adminInternalChatSendSchema.parse({ content: 'Hello' }),
      ).toThrow();
    });

    it('rejects empty string values', () => {
      expect(() =>
        adminInternalChatSendSchema.parse({
          agentId: '',
          targetKey: 'c-1',
          provider: 'email',
          content: 'Hi',
        }),
      ).toThrow();
    });
  });

  describe('createExternalInternalChatAccountSchema', () => {
    it('validates with required fields only', () => {
      const result = createExternalInternalChatAccountSchema.parse({
        provider: 'email',
        targetKey: 'user@example.com',
      });
      expect(result.provider).toBe('email');
      expect(result.targetKey).toBe('user@example.com');
    });

    it('accepts optional name field', () => {
      const result = createExternalInternalChatAccountSchema.parse({
        provider: 'slack',
        targetKey: 'U123456',
        name: 'Alice',
      });
      expect(result.name).toBe('Alice');
    });

    it('rejects missing provider', () => {
      expect(() =>
        createExternalInternalChatAccountSchema.parse({ targetKey: 'k-1' }),
      ).toThrow();
    });
  });

  describe('updateExternalInternalChatAccountSchema', () => {
    it('validates with required fields only', () => {
      const result = updateExternalInternalChatAccountSchema.parse({
        accountId: 'acct-123',
      });
      expect(result.accountId).toBe('acct-123');
    });

    it('accepts optional name update', () => {
      const result = updateExternalInternalChatAccountSchema.parse({
        accountId: 'acct-123',
        name: 'New Name',
      });
      expect(result.name).toBe('New Name');
    });

    it('accepts valid webhookUrl', () => {
      const result = updateExternalInternalChatAccountSchema.parse({
        accountId: 'acct-123',
        webhookUrl: 'https://example.com/webhook',
      });
      expect(result.webhookUrl).toBe('https://example.com/webhook');
    });

    it('accepts null webhookUrl', () => {
      const result = updateExternalInternalChatAccountSchema.parse({
        accountId: 'acct-123',
        webhookUrl: null,
      });
      expect(result.webhookUrl).toBeNull();
    });

    it('rejects invalid webhookUrl', () => {
      expect(() =>
        updateExternalInternalChatAccountSchema.parse({
          accountId: 'acct-123',
          webhookUrl: 'not-a-url',
        }),
      ).toThrow();
    });
  });

  describe('deleteExternalInternalChatAccountSchema', () => {
    it('validates with accountId', () => {
      const result = deleteExternalInternalChatAccountSchema.parse({
        accountId: 'acct-123',
      });
      expect(result.accountId).toBe('acct-123');
    });

    it('rejects missing accountId', () => {
      expect(() => deleteExternalInternalChatAccountSchema.parse({})).toThrow();
    });

    it('rejects empty accountId', () => {
      expect(() =>
        deleteExternalInternalChatAccountSchema.parse({ accountId: '' }),
      ).toThrow();
    });
  });

  describe('internalChatAccountIdQuerySchema', () => {
    it('validates accountId', () => {
      const result = internalChatAccountIdQuerySchema.parse({
        accountId: 'acct-abc',
      });
      expect(result.accountId).toBe('acct-abc');
    });

    it('rejects empty accountId', () => {
      expect(() =>
        internalChatAccountIdQuerySchema.parse({ accountId: '' }),
      ).toThrow();
    });
  });

  describe('internalChatMessagesQuerySchema', () => {
    it('applies defaults', () => {
      const result = internalChatMessagesQuerySchema.parse({
        accountId: 'acct-123',
        conversationId: 'conv-456',
      });
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('respects provided values', () => {
      const result = internalChatMessagesQuerySchema.parse({
        accountId: 'acct-123',
        conversationId: 'conv-456',
        limit: '50',
        offset: '10',
      });
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(10);
    });

    it('rejects limit below minimum', () => {
      expect(() =>
        internalChatMessagesQuerySchema.parse({
          accountId: 'acct-123',
          conversationId: 'conv-456',
          limit: 0,
        }),
      ).toThrow();
    });
  });

  describe('internalChatMessageAttachmentQuerySchema', () => {
    it('validates all required fields', () => {
      const result = internalChatMessageAttachmentQuerySchema.parse({
        accountId: 'acct-123',
        conversationId: 'conv-456',
        messageId: 'msg-789',
        attachmentName: 'document.pdf',
      });
      expect(result.attachmentName).toBe('document.pdf');
    });

    it('rejects missing attachmentName', () => {
      expect(() =>
        internalChatMessageAttachmentQuerySchema.parse({
          accountId: 'acct-123',
          conversationId: 'conv-456',
          messageId: 'msg-789',
        }),
      ).toThrow();
    });
  });

  describe('createInternalChatConversationSchema', () => {
    it('validates with required fields', () => {
      const result = createInternalChatConversationSchema.parse({
        accountId: 'acct-123',
        memberKeys: ['user-1', 'user-2'],
      });
      expect(result.accountId).toBe('acct-123');
      expect(result.memberKeys).toHaveLength(2);
    });

    it('accepts optional name field', () => {
      const result = createInternalChatConversationSchema.parse({
        accountId: 'acct-123',
        memberKeys: ['user-1'],
        name: 'Project Chat',
      });
      expect(result.name).toBe('Project Chat');
    });

    it('rejects empty memberKeys array', () => {
      expect(() =>
        createInternalChatConversationSchema.parse({
          accountId: 'acct-123',
          memberKeys: [],
        }),
      ).toThrow();
    });

    it('rejects missing memberKeys', () => {
      expect(() =>
        createInternalChatConversationSchema.parse({ accountId: 'acct-123' }),
      ).toThrow();
    });
  });

  describe('sendInternalChatConversationMessageSchema', () => {
    it('validates with required fields', () => {
      const result = sendInternalChatConversationMessageSchema.parse({
        conversationId: 'conv-123',
        content: 'Hello everyone',
      });
      expect(result.content).toBe('Hello everyone');
    });

    it('accepts optional parentMessageId for replies', () => {
      const result = sendInternalChatConversationMessageSchema.parse({
        conversationId: 'conv-123',
        content: 'Reply to message',
        parentMessageId: 'msg-parent-1',
      });
      expect(result.parentMessageId).toBe('msg-parent-1');
    });

    it('rejects empty conversationId', () => {
      expect(() =>
        sendInternalChatConversationMessageSchema.parse({
          conversationId: '',
          content: 'Hello',
        }),
      ).toThrow();
    });

    it('rejects empty content', () => {
      expect(() =>
        sendInternalChatConversationMessageSchema.parse({
          conversationId: 'conv-123',
          content: '',
        }),
      ).toThrow();
    });
  });

  describe('updateInternalChatConversationSchema', () => {
    it('accepts optional name update', () => {
      const result = updateInternalChatConversationSchema.parse({
        conversationId: 'conv-123',
        name: 'Updated Name',
      });
      expect(result.name).toBe('Updated Name');
    });

    it('accepts optional archive flag', () => {
      const result = updateInternalChatConversationSchema.parse({
        conversationId: 'conv-123',
        archive: true,
      });
      expect(result.archive).toBe(true);
    });

    it('rejects missing conversationId', () => {
      expect(() =>
        updateInternalChatConversationSchema.parse({ name: 'Test' }),
      ).toThrow();
    });
  });

  describe('archiveInternalChatConversationSchema', () => {
    it('validates conversationId', () => {
      const result = archiveInternalChatConversationSchema.parse({
        conversationId: 'conv-123',
      });
      expect(result.conversationId).toBe('conv-123');
    });

    it('rejects empty conversationId', () => {
      expect(() =>
        archiveInternalChatConversationSchema.parse({ conversationId: '' }),
      ).toThrow();
    });
  });

  describe('internalChatGroupMembersQuerySchema', () => {
    it('validates conversationId', () => {
      const result = internalChatGroupMembersQuerySchema.parse({
        conversationId: 'conv-abc',
      });
      expect(result.conversationId).toBe('conv-abc');
    });

    it('rejects empty conversationId', () => {
      expect(() =>
        internalChatGroupMembersQuerySchema.parse({ conversationId: '' }),
      ).toThrow();
    });
  });

  describe('addInternalChatGroupMemberSchema', () => {
    it('validates with all fields', () => {
      const result = addInternalChatGroupMemberSchema.parse({
        conversationId: 'conv-123',
        participantKey: 'user-xyz',
        role: 'admin',
      });
      expect(result.role).toBe('admin');
    });

    it('applies default role', () => {
      const result = addInternalChatGroupMemberSchema.parse({
        conversationId: 'conv-123',
        participantKey: 'user-xyz',
      });
      expect(result.role).toBe('normal');
    });

    it('rejects invalid role', () => {
      expect(() =>
        addInternalChatGroupMemberSchema.parse({
          conversationId: 'conv-123',
          participantKey: 'user-xyz',
          role: 'superuser',
        }),
      ).toThrow();
    });

    it('rejects missing fields', () => {
      expect(() =>
        addInternalChatGroupMemberSchema.parse({ conversationId: 'conv-123' }),
      ).toThrow();
      expect(() =>
        addInternalChatGroupMemberSchema.parse({ participantKey: 'u-1' }),
      ).toThrow();
    });
  });

  describe('updateInternalChatGroupMemberRoleSchema', () => {
    it('validates admin role', () => {
      const result = updateInternalChatGroupMemberRoleSchema.parse({
        conversationId: 'conv-123',
        participantKey: 'user-xyz',
        role: 'admin',
      });
      expect(result.role).toBe('admin');
    });

    it('validates normal role', () => {
      const result = updateInternalChatGroupMemberRoleSchema.parse({
        conversationId: 'conv-123',
        participantKey: 'user-xyz',
        role: 'normal',
      });
      expect(result.role).toBe('normal');
    });

    it('rejects invalid role', () => {
      expect(() =>
        updateInternalChatGroupMemberRoleSchema.parse({
          conversationId: 'conv-123',
          participantKey: 'user-xyz',
          role: 'moderator',
        }),
      ).toThrow();
    });
  });

  describe('removeInternalChatGroupMemberSchema', () => {
    it('validates required fields', () => {
      const result = removeInternalChatGroupMemberSchema.parse({
        conversationId: 'conv-123',
        participantKey: 'user-xyz',
      });
      expect(result.conversationId).toBe('conv-123');
      expect(result.participantKey).toBe('user-xyz');
    });

    it('rejects missing participantKey', () => {
      expect(() =>
        removeInternalChatGroupMemberSchema.parse({
          conversationId: 'conv-123',
        }),
      ).toThrow();
    });

    it('rejects empty participantKey', () => {
      expect(() =>
        removeInternalChatGroupMemberSchema.parse({
          conversationId: 'conv-123',
          participantKey: '',
        }),
      ).toThrow();
    });
  });
});
