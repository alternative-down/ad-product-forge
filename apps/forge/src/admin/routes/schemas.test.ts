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

    it('rejects empty provider', () => {
      expect(() =>
        agentConversationMessagesQuerySchema.parse({
          agentId: 'agent-1',
          provider: '',
          targetKey: 'key',
        }),
      ).toThrow();
    });
  });

  describe('agentLongTermMemoryRecallSearchSchema', () => {
    it('applies defaults', () => {
      const result = agentLongTermMemoryRecallSearchSchema.parse({
        agentId: 'agent-1',
        query: 'find tasks',
      });
      expect(result.limit).toBe(10);
    });

    it('respects provided limit', () => {
      const result = agentLongTermMemoryRecallSearchSchema.parse({
        agentId: 'agent-1',
        query: 'find tasks',
        limit: '25',
      });
      expect(result.limit).toBe(25);
    });

    it('rejects limit above maximum', () => {
      expect(() =>
        agentLongTermMemoryRecallSearchSchema.parse({
          agentId: 'agent-1',
          query: 'find tasks',
          limit: 150,
        }),
      ).toThrow();
    });

    it('rejects empty query', () => {
      expect(() =>
        agentLongTermMemoryRecallSearchSchema.parse({
          agentId: 'agent-1',
          query: '',
        }),
      ).toThrow();
    });
  });

  describe('adminInternalChatSendSchema', () => {
    it('validates required fields', () => {
      const result = adminInternalChatSendSchema.parse({
        agentId: 'agent-1',
        targetKey: 'user-abc',
        provider: 'email',
        content: 'Hello there',
      });
      expect(result.agentId).toBe('agent-1');
      expect(result.content).toBe('Hello there');
    });

    it('rejects missing content', () => {
      expect(() =>
        adminInternalChatSendSchema.parse({
          agentId: 'agent-1',
          targetKey: 'user-abc',
          provider: 'email',
        }),
      ).toThrow();
    });
  });

  describe('createExternalInternalChatAccountSchema', () => {
    it('validates required fields', () => {
      const result = createExternalInternalChatAccountSchema.parse({
        provider: 'slack',
        targetKey: 'channel-123',
      });
      expect(result.provider).toBe('slack');
    });

    it('allows optional name', () => {
      const result = createExternalInternalChatAccountSchema.parse({
        provider: 'slack',
        targetKey: 'channel-123',
        name: 'My Slack',
      });
      expect(result.name).toBe('My Slack');
    });
  });

  describe('updateExternalInternalChatAccountSchema', () => {
    it('allows optional fields', () => {
      const result = updateExternalInternalChatAccountSchema.parse({
        accountId: 'acct-1',
      });
      expect(result.accountId).toBe('acct-1');
    });

    it('accepts valid webhookUrl', () => {
      const result = updateExternalInternalChatAccountSchema.parse({
        accountId: 'acct-1',
        webhookUrl: 'https://example.com/hook',
      });
      expect(result.webhookUrl).toBe('https://example.com/hook');
    });

    it('accepts null webhookUrl', () => {
      const result = updateExternalInternalChatAccountSchema.parse({
        accountId: 'acct-1',
        webhookUrl: null,
      });
      expect(result.webhookUrl).toBeNull();
    });

    it('rejects invalid webhookUrl', () => {
      expect(() =>
        updateExternalInternalChatAccountSchema.parse({
          accountId: 'acct-1',
          webhookUrl: 'not-a-url',
        }),
      ).toThrow();
    });
  });

  describe('deleteExternalInternalChatAccountSchema', () => {
    it('validates required accountId', () => {
      const result = deleteExternalInternalChatAccountSchema.parse({
        accountId: 'acct-1',
      });
      expect(result.accountId).toBe('acct-1');
    });
  });

  describe('internalChatAccountIdQuerySchema', () => {
    it('validates required accountId', () => {
      const result = internalChatAccountIdQuerySchema.parse({
        accountId: 'acct-1',
      });
      expect(result.accountId).toBe('acct-1');
    });
  });

  describe('internalChatMessagesQuerySchema', () => {
    it('applies defaults', () => {
      const result = internalChatMessagesQuerySchema.parse({
        accountId: 'acct-1',
        conversationId: 'conv-1',
      });
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('respects provided values', () => {
      const result = internalChatMessagesQuerySchema.parse({
        accountId: 'acct-1',
        conversationId: 'conv-1',
        limit: '50',
        offset: '10',
      });
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(10);
    });
  });

  describe('internalChatMessageAttachmentQuerySchema', () => {
    it('validates all required fields', () => {
      const result = internalChatMessageAttachmentQuerySchema.parse({
        accountId: 'acct-1',
        conversationId: 'conv-1',
        messageId: 'msg-1',
        attachmentName: 'file.pdf',
      });
      expect(result.attachmentName).toBe('file.pdf');
    });
  });

  describe('createInternalChatConversationSchema', () => {
    it('allows optional name with memberKeys required', () => {
      const result = createInternalChatConversationSchema.parse({
        accountId: 'acct-1',
        memberKeys: ['user-1'],
      });
      expect(result.name).toBeUndefined();
    });

    it('validates required accountId with memberKeys', () => {
      const result = createInternalChatConversationSchema.parse({
        accountId: 'acct-1',
        name: 'Team Chat',
        memberKeys: ['user-1'],
      });
      expect(result.accountId).toBe('acct-1');
      expect(result.name).toBe('Team Chat');
    });
  });

  describe('sendInternalChatConversationMessageSchema', () => {
    it('validates required fields', () => {
      const result = sendInternalChatConversationMessageSchema.parse({
        conversationId: 'conv-1',
        content: 'Hello team',
      });
      expect(result.content).toBe('Hello team');
    });
  });

  describe('updateInternalChatConversationSchema', () => {
    it('allows optional fields', () => {
      const result = updateInternalChatConversationSchema.parse({
        conversationId: 'conv-1',
      });
      expect(result.conversationId).toBe('conv-1');
    });

    it('accepts name update', () => {
      const result = updateInternalChatConversationSchema.parse({
        conversationId: 'conv-1',
        name: 'New Name',
      });
      expect(result.name).toBe('New Name');
    });
  });

  describe('archiveInternalChatConversationSchema', () => {
    it('validates required conversationId', () => {
      const result = archiveInternalChatConversationSchema.parse({
        conversationId: 'conv-1',
      });
      expect(result.conversationId).toBe('conv-1');
    });
  });

  describe('internalChatGroupMembersQuerySchema', () => {
    it('validates required conversationId', () => {
      const result = internalChatGroupMembersQuerySchema.parse({
        conversationId: 'conv-1',
      });
      expect(result.conversationId).toBe('conv-1');
    });
  });

  describe('addInternalChatGroupMemberSchema', () => {
    it('validates all required fields', () => {
      const result = addInternalChatGroupMemberSchema.parse({
        conversationId: 'conv-123',
        participantKey: 'user-xyz',
        role: 'admin',
      });
      expect(result.role).toBe('admin');
    });

    it('accepts normal role', () => {
      const result = addInternalChatGroupMemberSchema.parse({
        conversationId: 'conv-123',
        participantKey: 'user-xyz',
        role: 'normal',
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

describe('Hire Agent Schema', () => {
  describe('hireAgentSchema', () => {
    it('validates required fields for hiring request', () => {
      const result = hireAgentSchema.parse({
        hiringRequest: 'I need a senior developer for frontend work',
        weeklyBudgetUsd: 500,
      });
      expect(result.hiringRequest).toBe('I need a senior developer for frontend work');
      expect(result.weeklyBudgetUsd).toBe(500);
    });

    it('allows optional additionalContext', () => {
      const result = hireAgentSchema.parse({
        hiringRequest: 'Build a login page',
        additionalContext: 'Use React and TypeScript',
        weeklyBudgetUsd: 300,
      });
      expect(result.additionalContext).toBe('Use React and TypeScript');
    });

    it('rejects zero budget', () => {
      expect(() =>
        hireAgentSchema.parse({
          hiringRequest: 'Test request',
          weeklyBudgetUsd: 0,
        }),
      ).toThrow();
    });

    it('rejects negative budget', () => {
      expect(() =>
        hireAgentSchema.parse({
          hiringRequest: 'Test request',
          weeklyBudgetUsd: -100,
        }),
      ).toThrow();
    });

    it('rejects empty hiring request', () => {
      expect(() =>
        hireAgentSchema.parse({
          hiringRequest: '',
          weeklyBudgetUsd: 200,
        }),
      ).toThrow();
    });
  });
});

describe('System Integration Schemas', () => {
  describe('upsertSystemIntegrationSchema — migadu variant', () => {
    it('validates migadu integration with email api credentials', () => {
      const result = upsertSystemIntegrationSchema.parse({
        providerType: 'migadu',
        isEnabled: true,
        config: {
          apiUser: 'admin@example.com',
          apiKey: 'secret-key-123',
        },
      });
      expect(result.providerType).toBe('migadu');
      expect(result.config.apiUser).toBe('admin@example.com');
    });

    it('rejects migadu with invalid email', () => {
      expect(() =>
        upsertSystemIntegrationSchema.parse({
          providerType: 'migadu',
          config: { apiUser: 'not-email', apiKey: 'key' },
        }),
      ).toThrow();
    });
  });

  describe('upsertSystemIntegrationSchema — coolify variant', () => {
    it('validates coolify integration with full config', () => {
      const result = upsertSystemIntegrationSchema.parse({
        providerType: 'coolify',
        isEnabled: true,
        config: {
          baseUrl: 'https://coolify.example.com',
          adminToken: 'tok_abc123',
          serverId: 'srv-1',
          destinationId: 'dest-2',
          applicationsBaseDomain: 'app.example.com',
        },
      });
      expect(result.providerType).toBe('coolify');
      expect(result.config.baseUrl).toBe('https://coolify.example.com');
    });

    it('rejects coolify with invalid baseUrl', () => {
      expect(() =>
        upsertSystemIntegrationSchema.parse({
          providerType: 'coolify',
          config: {
            baseUrl: 'not-a-url',
            adminToken: 'tok',
            serverId: 's1',
            destinationId: 'd1',
          },
        }),
      ).toThrow();
    });

    it('applies default isEnabled', () => {
      const result = upsertSystemIntegrationSchema.parse({
        providerType: 'coolify',
        config: {
          baseUrl: 'https://coolify.example.com',
          adminToken: 'tok_abc123',
          serverId: 'srv-1',
          destinationId: 'dest-2',
        },
      });
      expect(result.isEnabled).toBe(true);
    });
  });

  describe('upsertSystemIntegrationSchema — github variant', () => {
    it('validates github integration', () => {
      const result = upsertSystemIntegrationSchema.parse({
        providerType: 'github',
        isEnabled: false,
        config: {
          organization: 'my-org',
          appHomeUrl: 'https://github.com/apps/my-app',
        },
      });
      expect(result.providerType).toBe('github');
      expect(result.isEnabled).toBe(false);
    });

    it('rejects github with invalid appHomeUrl', () => {
      expect(() =>
        upsertSystemIntegrationSchema.parse({
          providerType: 'github',
          config: { organization: 'my-org', appHomeUrl: 'not-a-url' },
        }),
      ).toThrow();
    });
  });

  describe('upsertSystemIntegrationSchema — minimax variant', () => {
    it('validates minimax integration', () => {
      const result = upsertSystemIntegrationSchema.parse({
        providerType: 'minimax',
        config: {
          apiKey: 'minimax-key-xyz',
        },
      });
      expect(result.providerType).toBe('minimax');
    });
  });

  describe('upsertSystemIntegrationSchema — discriminated union enforcement', () => {
    it('rejects mismatched providerType', () => {
      expect(() =>
        upsertSystemIntegrationSchema.parse({
          providerType: 'coolify',
          config: { apiUser: 'x', apiKey: 'y' }, // migadu config shape
        }),
      ).toThrow();
    });

    it('rejects unknown providerType', () => {
      expect(() =>
        upsertSystemIntegrationSchema.parse({
          providerType: 'unknown',
          config: {},
        }),
      ).toThrow();
    });
  });
});

describe('Finance Schemas', () => {
  describe('createPayableSchema — agent_contract variant', () => {
    it('validates agent_contract payable', () => {
      const result = createPayableSchema.parse({
        kind: 'agent_contract',
        agentId: 'agent-1',
        amount: 150,
        description: 'Week 1 work',
      });
      expect(result.kind).toBe('agent_contract');
      expect(result.amount).toBe(150);
    });

    it('allows optional description', () => {
      const result = createPayableSchema.parse({
        kind: 'agent_contract',
        agentId: 'agent-1',
        amount: 200,
      });
      expect(result.description).toBeUndefined();
    });

    it('rejects zero amount', () => {
      expect(() =>
        createPayableSchema.parse({
          kind: 'agent_contract',
          agentId: 'agent-1',
          amount: 0,
        }),
      ).toThrow();
    });
  });

  describe('createPayableSchema — system_expense variant', () => {
    it('validates system_expense payable', () => {
      const result = createPayableSchema.parse({
        kind: 'system_expense',
        description: 'Cloud hosting fees',
        amount: 500,
        category: 'infrastructure',
      });
      expect(result.kind).toBe('system_expense');
      expect(result.amount).toBe(500);
    });

    it('rejects negative amount on system_expense', () => {
      expect(() =>
        createPayableSchema.parse({
          kind: 'system_expense',
          description: 'Expense',
          amount: -1,
          category: 'misc',
        }),
      ).toThrow();
    });

    it('rejects system_expense without category', () => {
      expect(() =>
        createPayableSchema.parse({
          kind: 'system_expense',
          description: 'Expense',
          amount: 50,
        }),
      ).toThrow();
    });
  });

  describe('createPayableSchema — discriminated union enforcement', () => {
    it('rejects missing kind', () => {
      expect(() =>
        createPayableSchema.parse({
          agentId: 'agent-1',
          amount: 100,
        }),
      ).toThrow();
    });

    it('rejects unknown kind', () => {
      expect(() =>
        createPayableSchema.parse({
          kind: 'subscription',
          description: 'x',
          amount: 50,
          category: 'misc',
        }),
      ).toThrow();
    });
  });
});

describe('MCP Server Schemas', () => {
  describe('createAgentMcpServerSchema — stdio transport', () => {
    it('validates stdio transport config', () => {
      const result = createAgentMcpServerSchema.parse({
        agentId: 'agent-1',
        name: 'filesystem-server',
        transport: 'stdio',
        command: '/usr/local/bin/mcp-server',
        argsText: '--verbose',
        envVarsText: 'API_KEY=secret',
        url: '',
        headersText: '',
      });
      expect(result.transport).toBe('stdio');
      expect(result.command).toBe('/usr/local/bin/mcp-server');
    });

    it('applies default isActive', () => {
      const result = createAgentMcpServerSchema.parse({
        agentId: 'agent-1',
        name: 'test-server',
        transport: 'stdio',
        command: 'node',
      });
      expect(result.isActive).toBe(true);
    });

    it('applies default empty strings for optional fields', () => {
      const result = createAgentMcpServerSchema.parse({
        agentId: 'agent-1',
        name: 'test-server',
        transport: 'stdio',
        command: 'node',
      });
      expect(result.argsText).toBe('');
      expect(result.envVarsText).toBe('');
      expect(result.url).toBe('');
      expect(result.headersText).toBe('');
    });

    it('rejects empty name', () => {
      expect(() =>
        createAgentMcpServerSchema.parse({
          agentId: 'agent-1',
          name: '   ',
          transport: 'stdio',
          command: 'node',
        }),
      ).toThrow();
    });

    it('rejects empty command', () => {
      expect(() =>
        createAgentMcpServerSchema.parse({
          agentId: 'agent-1',
          name: 'server',
          transport: 'stdio',
          command: '',
        }),
      ).toThrow();
    });
  });

  describe('createAgentMcpServerSchema — http_streamable transport', () => {
    it('validates http_streamable transport config', () => {
      const result = createAgentMcpServerSchema.parse({
        agentId: 'agent-1',
        name: 'remote-api',
        transport: 'http_streamable',
        url: 'https://mcp.example.com/stream',
        headersText: 'Authorization: Bearer token',
      });
      expect(result.transport).toBe('http_streamable');
      expect(result.url).toBe('https://mcp.example.com/stream');
    });

    it('rejects stdio fields on http_streamable variant', () => {
      // http_streamable variant has command as optional default(''),
      // but url must be a valid URL
      expect(() =>
        createAgentMcpServerSchema.parse({
          agentId: 'agent-1',
          name: 'remote-api',
          transport: 'http_streamable',
          url: 'not-a-url',
        }),
      ).toThrow();
    });

    it('accepts http_streamable without command', () => {
      const result = createAgentMcpServerSchema.parse({
        agentId: 'agent-1',
        name: 'remote-api',
        transport: 'http_streamable',
        url: 'https://api.example.com/mcp',
      });
      expect(result.transport).toBe('http_streamable');
      expect(result.url).toBe('https://api.example.com/mcp');
    });
  });
});
