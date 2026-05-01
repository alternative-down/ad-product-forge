import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------
const mockHelpers = {
  buildAgentAccountDescription: vi.fn(
    (opts: { agentId: string; agentName: string }) =>
      `${opts.agentId} (${opts.agentName})`,
  ),
  buildGroupMemberViews: vi.fn((members: unknown[]) =>
    (members as Array<Record<string, unknown>>).map((m) => ({
      participantId: m.participantId,
      participantKey: (m.participantKey ?? m.participantId) as string,
      participantSlug: (m.participantSlug ?? m.participantId) as string,
      participantName: (m.participantName ?? m.participantId) as string,
      role: m.role,
    })),
  ),
  buildGroupMetadata: vi.fn((participants: unknown[]) =>
    (participants as Array<Record<string, string>>).map((p) => ({
      participantId: p.participantId ?? p.participantId,
      participantKey: (p.participantKey ?? p.participantId) as string,
      participantSlug: (p.participantSlug ?? p.participantId) as string,
      participantName: (p.participantName ?? p.participantId) as string,
      role: p.role ?? 'normal',
    })),
  ),
  buildConversationParticipantNames: vi.fn(
    (participants: Array<{ displayName?: string; participantName?: string }>) =>
      participants.map((p) => p.displayName ?? p.participantName ?? ''),
  ),
  createInternalChatSlug: vi.fn((name: string) =>
    name.toLowerCase().replace(/\s+/g, '-'),
  ),
  buildGroupRow: vi.fn((row: Record<string, unknown>) => ({
    groupId: row.id,
    name: (row.name ?? row.id) as string,
    provider: 'internal-chat',
    conversationKey: row.id,
    createdAt: new Date(row.createdAt as number).toISOString(),
    updatedAt: new Date(row.updatedAt as number).toISOString(),
  })),
  sanitizeAttachmentName: vi.fn((name: string) => name),
  resolveContentType: vi.fn(() => undefined),
  parseFilterDate: vi.fn(() => null),
  sortParticipantsBySelfFirst: vi.fn(<T extends Record<string, unknown>>(rows: T[]) => rows),
  resolveConversationDisplayName: vi.fn(() => undefined),
};

vi.mock('./internal-chat-helpers', async () => mockHelpers);
const mockGroups = vi.hoisted(() => ({
  createChatGroup: vi.fn(),
  addMemberToGroup: vi.fn(),
  removeMemberFromGroup: vi.fn(),
  changeChatGroup: vi.fn(),
  listChatGroups: vi.fn(),
  listGroupMembers: vi.fn(),
  listGroupMembersByAccount: vi.fn(),
}));
vi.mock('./internal-chat-groups', async () => ({
  ...(await vi.importActual('./internal-chat-groups')),
  createInternalChatGroups: () => mockGroups,
  createInternalChatService: () => mockGroups,
}));


vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

vi.mock('../utils/id', () => ({
  createId: vi.fn(() => 'mock-id-123'),
}));

// ---------------------------------------------------------------------------
// Query chain builder
// ---------------------------------------------------------------------------
/** thenable + sync-iterable chain — await resolves to result, for...of iterates it. */
function createChain(result: unknown) {
  const chain: Record<string, unknown> = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    offset: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    in: vi.fn(() => chain),
    inArray: vi.fn(() => chain),
  };
  Object.defineProperty(chain, 'all', {
    value: vi.fn(() => Promise.resolve(result)),
    configurable: true, writable: true,
  });
  // Make chain awaitable: await chain → result
  Object.defineProperty(chain, 'then', {
    value: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled),
    configurable: true, writable: true,
  });
  // Make chain sync-iterable: for (const x of chain) → iterates result
  chain[Symbol.iterator] = function* () { yield* (result as unknown[]); };
  return chain;
}

// ---------------------------------------------------------------------------
// Mock DB factory
// ---------------------------------------------------------------------------
// Mock DB factory
// ---------------------------------------------------------------------------
function createMockDb() {
  const db = {
    query: {
      internalChatAccounts: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      internalChatConversations: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      internalChatConversationMembers: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      internalChatMessages: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      internalChatMessageAttachments: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      internalChatMessageReads: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    select: vi.fn(() => createChain([])),
    insert: vi.fn(),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve({})),
      })),
      where: vi.fn(() => ({
        set: vi.fn(() => Promise.resolve({})),
      })),
    })),
    transaction: vi.fn((fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve({})) })),
  };
  return db;
}

// Import service
// ---------------------------------------------------------------------------
const { createInternalChatService } = await import('./internal-chat-service');

const MOCK_NOW = 1700000000000;
const MOCK_DATE = new Date(MOCK_NOW);

const MOCK_ACCOUNT_A = {
  id: 'acc_kaelen',
  agentId: 'agent-kaelen',
  slug: 'kaelen',
  displayName: 'Kaelen',
  description: 'agent-kaelen (Kaelen)',
  createdAt: MOCK_DATE,
  updatedAt: MOCK_DATE,
};

const MOCK_ACCOUNT_B = {
  id: 'acc_bob',
  agentId: 'agent-bob',
  slug: 'bob',
  displayName: 'Bob',
  description: 'agent-bob (Bob)',
  createdAt: MOCK_DATE,
  updatedAt: MOCK_DATE,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('createInternalChatService', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW);
    db = createMockDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // registerAgentAccount
  // -------------------------------------------------------------------------
  describe('registerAgentAccount', () => {
    it('returns existing account when already registered', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(MOCK_ACCOUNT_A); // listConversations direct call
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(MOCK_ACCOUNT_A); // listGroupMembersOrDmPeers nested call

      const service = createInternalChatService(db);
      const result = await service.registerAgentAccount({
        agentId: 'agent-kaelen',
        displayName: 'Kaelen',
        agentName: 'Kaelen',
      });

      expect(result.accountId).toBe('acc_kaelen');
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('inserts a new account when not yet registered', async () => {
      db.query.internalChatAccounts.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      db.query.internalChatConversationMembers.findMany.mockResolvedValueOnce([]);
      db.query.internalChatConversations.findFirst.mockResolvedValue(null);
      db.query.internalChatAccounts.findMany.mockResolvedValueOnce([]);

      db.insert.mockImplementation(() => ({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue({
          id: 'acc_new',
          agentId: 'agent-kaelen',
          slug: 'kaelen',
          displayName: 'Kaelen',
          description: 'agent-kaelen (Kaelen)',
          createdAt: MOCK_DATE,
          updatedAt: MOCK_DATE,
        }),
      }));

      const service = createInternalChatService(db);
      const result = await service.registerAgentAccount({
        agentId: 'agent-kaelen',
        displayName: 'Kaelen',
        agentName: 'Kaelen',
      });

      expect(result.agentId).toBe('agent-kaelen');
    });

    it('creates DM conversations with existing accounts when registering', async () => {
      db.query.internalChatAccounts.findFirst
        .mockResolvedValueOnce(null)   // no existing account
        .mockResolvedValueOnce(null);  // no existing DM peer for ensureDirectConversation
      db.query.internalChatConversationMembers.findMany.mockResolvedValueOnce([]);
      db.query.internalChatConversations.findFirst.mockResolvedValue(null);
      db.query.internalChatAccounts.findMany.mockResolvedValue([MOCK_ACCOUNT_B]);

      // ensureDirectConversation → db.select().from().where().limit() → empty rows
      db.select.mockReturnValueOnce(createChain([]));

      let insertCall = 0;
      db.insert.mockImplementation(() => ({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue(
          insertCall++ === 0
            ? {
                id: 'dm_new_bob',
                type: 'dm',
                name: null,
                createdByAccountId: 'acc_new',
                createdAt: MOCK_NOW,
                updatedAt: MOCK_NOW,
              }
            : {
                id: 'member_new_bob',
                conversationId: 'dm_new_bob',
                accountId: 'acc_bob',
                role: 'normal',
                createdAt: MOCK_NOW,
              },
        ),
      }));

      const service = createInternalChatService(db);
      const result = await service.registerAgentAccount({
        agentId: 'agent-kaelen',
        displayName: 'Kaelen',
        agentName: 'Kaelen',
      });

      expect(result.agentId).toBe('agent-kaelen');
    });
  });

  // -------------------------------------------------------------------------
  // getAccountBySlug
  // -------------------------------------------------------------------------
  describe('getAccountBySlug', () => {
    it('returns the account when found', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(MOCK_ACCOUNT_A);

      const service = createInternalChatService(db);
      const result = await service.getAccountBySlug('kaelen');

      expect(result?.slug).toBe('kaelen');
    });

    it('returns null when not found', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(null);

      const service = createInternalChatService(db);
      const result = await service.getAccountBySlug('nonexistent');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getAccountByAgentId
  // -------------------------------------------------------------------------
  describe('getAccountByAgentId', () => {
    it('returns the account when found', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(MOCK_ACCOUNT_A);

      const service = createInternalChatService(db);
      const result = await service.getAccountByAgentId('agent-kaelen');

      expect(result?.agentId).toBe('agent-kaelen');
    });
  });

  // -------------------------------------------------------------------------
  // listAccounts
  // -------------------------------------------------------------------------
  describe('listAccounts', () => {
    it('returns all accounts', async () => {
      db.query.internalChatAccounts.findMany.mockResolvedValueOnce([
        MOCK_ACCOUNT_A,
        MOCK_ACCOUNT_B,
      ]);

      const service = createInternalChatService(db);
      const result = await service.listAccounts();

      expect(result).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // createChatGroup
  // -------------------------------------------------------------------------
  describe('createChatGroup', () => {
    it('creates a group and returns the group view', async () => {
      const groupId = 'my-team-group';
      mockGroups.createChatGroup.mockResolvedValueOnce({
        groupId,
        name: 'Team A',
        provider: 'internal-chat',
        conversationKey: groupId,
        creatorMember: { participantId: 'acc_kaelen', participantName: 'Kaelen', role: 'admin' },
        createdAt: '2025-01-01T00:00:00.000Z',
      });

      const service = createInternalChatService(db);
      const result = await service.createChatGroup({
        agentId: 'agent-kaelen',
        conversationKey: groupId,
        name: 'Team A',
        creatorName: 'Kaelen',
      });

      expect(result.groupId).toBe(groupId);
      expect(result.name).toBe('Team A');
      expect(mockGroups.createChatGroup).toHaveBeenCalledWith({
        agentId: 'agent-kaelen',
        conversationKey: groupId,
        name: 'Team A',
        creatorName: 'Kaelen',
      });
    });

    it('throws when agent account not found', async () => {
      mockGroups.createChatGroup.mockRejectedValueOnce(new Error('Agent account not found'));

      const service = createInternalChatService(db);
      await expect(
        service.createChatGroup({
          agentId: 'invalid',
          conversationKey: 'my-group',
          name: 'Team A',
          creatorName: 'Kaelen',
        }),
      ).rejects.toThrow('Agent account not found');
    });
  });

  // -------------------------------------------------------------------------
  // listChatGroups
  // -------------------------------------------------------------------------
  describe('listChatGroups', () => {
    it('returns groups for an agent', async () => {
      const groupRows = [
        { groupId: 'grp_1', name: 'Team A', conversationKey: 'grp_1', provider: 'internal-chat', createdAt: '2025-01-01T00:00:00.000Z', memberCount: 3 },
        { groupId: 'grp_2', name: 'Team B', conversationKey: 'grp_2', provider: 'internal-chat', createdAt: '2025-01-02T00:00:00.000Z', memberCount: 2 },
      ];
      mockGroups.listChatGroups.mockResolvedValueOnce(groupRows);

      const service = createInternalChatService(db);
      const result = await service.listChatGroups({ agentId: 'agent-kaelen', limit: 20 });

      expect(result).toHaveLength(2);
      expect(mockGroups.listChatGroups).toHaveBeenCalledWith({ agentId: 'agent-kaelen', limit: 20 });
    });

    it('returns empty array when agent has no groups', async () => {
      mockGroups.listChatGroups.mockResolvedValueOnce([]);

      const service = createInternalChatService(db);
      const result = await service.listChatGroups({ agentId: 'agent-kaelen', limit: 20 });

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // listConversations
  // -------------------------------------------------------------------------
  describe('listConversations', () => {
    it('returns conversations for an agent', async () => {
      // 1. listConversations direct call to getRequiredAgentAccount
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(MOCK_ACCOUNT_A);
      // 2. listGroupMembersOrDmPeers nested call to getRequiredAgentAccount
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(MOCK_ACCOUNT_A);

      const conversationRows = [
        { id: 'conv_1', name: 'DM with Bob', type: 'dm', updatedAt: MOCK_NOW },
      ];
      const messageRows = [
        {
          conversationId: 'conv_1',
          messageId: 'msg_1',
          content: 'Hello',
          createdAt: MOCK_NOW,
          authorAccountId: 'acc_kaelen',
          authorDisplayName: 'Kaelen',
          unread: 0,
        },
      ];

      const membersChain = createChain([{
        accountId: 'acc_kaelen',
        agentId: 'agent-kaelen',
        slug: 'kaelen',
        displayName: 'Kaelen',
      }]);

      // 1st → conversation rows; 2nd → message rows; 3rd → group members
      db.select
        .mockReturnValueOnce(createChain(conversationRows))
        .mockReturnValueOnce(createChain(messageRows))
        .mockReturnValueOnce(membersChain);

      const service = createInternalChatService(db);
      const result = await service.listConversations({ agentId: 'agent-kaelen', limit: 20 });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
    });

    it('returns empty list when no conversations', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(MOCK_ACCOUNT_A);
      db.select.mockReturnValueOnce(createChain([]));

      const service = createInternalChatService(db);
      const result = await service.listConversations({ agentId: 'agent-kaelen', limit: 20 });

      expect(result).toEqual([]);
    });
  });



// =============================================================================
// CHUNK 3 — Conversation Listing
// Covers: listConversations, listConversationsByAccount
// =============================================================================

  describe('listConversations', () => {
    it('returns empty array when agent has no conversations', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(MOCK_ACCOUNT_A);
      db.select.mockReturnValueOnce(createChain([]));

      const service = createInternalChatService(db);
      const result = await service.listConversations({ agentId: 'agent-kaelen', limit: 20 });

      expect(result).toEqual([]);
    });

    it('throws when agent has no chat account', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(null);

      const service = createInternalChatService(db);
      await expect(
        service.listConversations({ agentId: 'agent-no-account', limit: 20 }),
      ).rejects.toThrow('Internal chat account not found for agent: agent-no-account');
    });

    it('filters messages to unread only when unread=true', async () => {
      db.query.internalChatAccounts.findFirst
        .mockResolvedValueOnce(MOCK_ACCOUNT_A)
        .mockResolvedValueOnce(MOCK_ACCOUNT_A);

      db.select
        .mockReturnValueOnce(createChain([{ id: 'conv_1', name: null, type: 'direct', updatedAt: MOCK_DATE }]))
        .mockReturnValueOnce(
          createChain([
            { conversationId: 'conv_1', messageId: 'msg_read', content: 'Read', createdAt: MOCK_DATE, authorAccountId: 'acc_other', authorDisplayName: 'Other', unread: 0 },
            { conversationId: 'conv_1', messageId: 'msg_unread', content: 'Unread', createdAt: MOCK_DATE + 1, authorAccountId: 'acc_other', authorDisplayName: 'Other', unread: 1 },
          ]),
        )
        .mockReturnValueOnce(createChain([{ accountId: 'acc_kaelen', agentId: 'agent-kaelen', slug: 'kaelen', displayName: 'Kaelen' }]));

      const service = createInternalChatService(db);
      const result = await service.listConversations({ agentId: 'agent-kaelen', limit: 20, unread: true });

      expect(result[0].messages).toHaveLength(1);
      expect(result[0].messages[0].content).toBe('Unread');
    });
  });

  describe('listConversationsByAccount', () => {
    it('returns empty array when external account has no conversations', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce({
        id: 'acc_ext_1', agentId: null, slug: 'slack-ops', displayName: 'Slack Ops', description: null, createdAt: MOCK_DATE, updatedAt: MOCK_DATE,
      });
      db.select.mockReturnValueOnce(createChain([]));

      const service = createInternalChatService(db);
      const result = await service.listConversationsByAccount({ accountId: 'acc_ext_1', limit: 20 });

      expect(result).toHaveLength(0);
    });

    it('returns conversations with messages and participants', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce({
        id: 'acc_ext_1', agentId: null, slug: 'slack-ops', displayName: 'Slack Ops', description: null, createdAt: MOCK_DATE, updatedAt: MOCK_DATE,
      });
      db.select
        .mockReturnValueOnce(createChain([{ id: 'conv_1', name: 'Team Chat', type: 'group', updatedAt: MOCK_DATE }]))
        .mockReturnValueOnce(
          createChain([{ conversationId: 'conv_1', messageId: 'msg_1', content: 'Hello', createdAt: MOCK_DATE, authorAccountId: 'acc_agent', authorDisplayName: 'Agent' }]),
        )
        .mockReturnValueOnce(createChain([{ accountId: 'acc_ext_1', agentId: null, slug: 'slack-ops', displayName: 'Slack Ops' }]));

      const service = createInternalChatService(db);
      const result = await service.listConversationsByAccount({ accountId: 'acc_ext_1', limit: 20 });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Team Chat');
      expect(result[0].unreadCount).toBe(0);
    });

    it('throws when account does not exist', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(null);

      const service = createInternalChatService(db);
      await expect(
        service.listConversationsByAccount({ accountId: 'acc-nonexistent', limit: 20 }),
      ).rejects.toThrow('Internal chat account not found: acc-nonexistent');
    });

    it('throws when account belongs to an agent (external account required)', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce({
        id: 'acc_agent', agentId: 'agent-123', slug: 'agent-123', displayName: 'Agent 123', description: null, createdAt: MOCK_DATE, updatedAt: MOCK_DATE,
      });

      const service = createInternalChatService(db);
      await expect(
        service.listConversationsByAccount({ accountId: 'acc_agent', limit: 20 }),
      ).rejects.toThrow('External internal chat account not found: acc_agent');
    });
  });


  // -------------------------------------------------------------------------
  // sendMessage
  // -------------------------------------------------------------------------
  describe('sendMessage', () => {
    it('stores a message and returns success with message id', async () => {
      const convId = 'conv_1';

      db.query.internalChatAccounts.findFirst
        .mockResolvedValueOnce(MOCK_ACCOUNT_A) // getAccountByAgentId (author)
        .mockResolvedValueOnce(MOCK_ACCOUNT_A) // getRequiredAccount (author)
        .mockResolvedValueOnce(MOCK_ACCOUNT_A); // getRequiredAccount (member)

      db.query.internalChatConversations.findFirst.mockResolvedValueOnce({
        id: convId,
        name: 'Team A',
        type: 'group',
        createdAt: MOCK_DATE,
        updatedAt: MOCK_DATE,
        createdByAccountId: 'acc_kaelen',
      });

      db.query.internalChatConversationMembers.findMany.mockResolvedValueOnce([
        {
          accountId: 'acc_kaelen',
          conversationId: convId,
          role: 'admin',
          agentId: 'agent-kaelen',
          participantId: 'acc_kaelen',
          participantKey: 'agent-kaelen',
          participantSlug: 'kaelen',
          participantName: 'Kaelen',
          createdAt: MOCK_DATE,
        },
      ]);

      db.query.internalChatMessageReads.findMany.mockResolvedValueOnce([]);
      db.query.internalChatMessages.findFirst.mockResolvedValueOnce(null);
      db.query.internalChatMessageAttachments.findMany.mockResolvedValueOnce([]);

      const membersChain = createChain([{
        accountId: 'acc_kaelen',
        agentId: 'agent-kaelen',
        slug: 'kaelen',
        displayName: 'Kaelen',
      }]);

      // First select → ensureDirectConversation (empty → creates new DM)
      // Second select → listGroupMembersOrDmPeersByAccount (returns member)
      db.select
        .mockReturnValueOnce(createChain([]))
        .mockReturnValueOnce(membersChain);

      db.insert.mockImplementation(() => ({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue({
          id: 'msg_1',
          conversationId: convId,
          content: 'Hello',
          authorAccountId: 'acc_kaelen',
          createdAt: MOCK_NOW,
        }),
      }));

      const service = createInternalChatService(db);
      const result = await service.sendMessage({
        accountId: 'acc_kaelen',
        targetKey: convId,
        content: 'Hello',
        attachments: [],
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('mock-id-123');
    });
  });

// =============================================================================
// CHUNK 1 — External Accounts
// Covers: registerExternalAccount, updateExternalAccount, deleteExternalAccount
// =============================================================================

  describe('registerExternalAccount', () => {
    it('returns existing account with updated fields when slug already exists', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce({
        id: 'acc_ext_1',
        agentId: null,
        slug: 'slack-billing',
        displayName: 'Billing Bot',
        description: null,
        createdAt: MOCK_DATE,
        updatedAt: MOCK_DATE,
      });
      db.update.mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue({}),
      });

      const service = createInternalChatService(db);
      const result = await service.registerExternalAccount({
        slug: 'slack-billing',
        displayName: 'Billing Bot Updated',
        description: 'Updated description',
      });

      expect(result.accountId).toBe('acc_ext_1');
      expect(result.slug).toBe('slack-billing');
      expect(result.displayName).toBe('Billing Bot Updated');
      expect(result.description).toBe('Updated description');
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('creates a new account when slug does not exist', async () => {
      db.query.internalChatAccounts.findFirst
        .mockResolvedValueOnce(null); // no existing slug
      db.insert.mockImplementation(() => ({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue({
          id: 'acc_new_ext',
          agentId: null,
          slug: 'github-ops',
          displayName: 'GitHub Ops',
          description: null,
          createdAt: MOCK_DATE,
          updatedAt: MOCK_DATE,
        }),
      }));

      const service = createInternalChatService(db);
      const result = await service.registerExternalAccount({
        slug: 'github-ops',
        displayName: 'GitHub Ops',
        description: 'GitHub integration account',
      });

      expect(result.slug).toBe('github-ops');
      expect(result.description).toBe('GitHub integration account');
      expect(db.insert).toHaveBeenCalled();
    });

    it('creates account with null description when description is omitted', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(null);
      db.insert.mockImplementation(() => ({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue({
          id: 'acc_new_ext',
          agentId: null,
          slug: 'zapier',
          displayName: 'Zapier',
          description: null,
          createdAt: MOCK_DATE,
          updatedAt: MOCK_DATE,
        }),
      }));

      const service = createInternalChatService(db);
      const result = await service.registerExternalAccount({
        slug: 'zapier',
        displayName: 'Zapier',
      });

      expect(result.description).toBeUndefined();
    });
  });

  describe('updateExternalAccount', () => {
    it('updates the account and returns new values', async () => {
      db.query.internalChatAccounts.findFirst
        .mockResolvedValueOnce({
          id: 'acc_ext_1',
          agentId: null,
          slug: 'slack-billing',
          displayName: 'Old Name',
          description: 'Old desc',
          createdAt: MOCK_DATE,
          updatedAt: MOCK_DATE,
        })
        .mockResolvedValueOnce(null); // no slug conflict
      db.update.mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue({}),
      });

      const service = createInternalChatService(db);
      const result = await service.updateExternalAccount({
        accountId: 'acc_ext_1',
        slug: 'slack-billing',
        displayName: 'New Name',
        description: 'New desc',
      });

      expect(result.displayName).toBe('New Name');
      expect(result.description).toBe('New desc');
    });

    it('throws when account is not found', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(null);

      const service = createInternalChatService(db);
      await expect(
        service.updateExternalAccount({
          accountId: 'acc_nonexistent',
          slug: 'x',
          displayName: 'X',
        }),
      ).rejects.toThrow('External account not found: acc_nonexistent');
    });

    it('throws when account belongs to an agent', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce({
        id: 'acc_agent',
        agentId: 'agent-123',
        slug: 'agent-123',
        displayName: 'Agent 123',
        description: null,
        createdAt: MOCK_DATE,
        updatedAt: MOCK_DATE,
      });

      const service = createInternalChatService(db);
      await expect(
        service.updateExternalAccount({
          accountId: 'acc_agent',
          slug: 'x',
          displayName: 'X',
        }),
      ).rejects.toThrow('External account not found: acc_agent');
    });

    it('throws when new slug conflicts with another account', async () => {
      db.query.internalChatAccounts.findFirst
        .mockResolvedValueOnce({
          id: 'acc_ext_1',
          agentId: null,
          slug: 'old-slug',
          displayName: 'Old Name',
          description: null,
          createdAt: MOCK_DATE,
          updatedAt: MOCK_DATE,
        })
        .mockResolvedValueOnce({
          id: 'acc_other',
          agentId: null,
          slug: 'taken-slug',
          displayName: 'Other',
          description: null,
          createdAt: MOCK_DATE,
          updatedAt: MOCK_DATE,
        });

      const service = createInternalChatService(db);
      await expect(
        service.updateExternalAccount({
          accountId: 'acc_ext_1',
          slug: 'taken-slug',
          displayName: 'Name',
        }),
      ).rejects.toThrow('Internal chat account slug already exists: taken-slug');
    });
  });

  describe('deleteExternalAccount', () => {
    it('deletes the account and returns success', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce({
        id: 'acc_ext_1',
        agentId: null,
        slug: 'slack-billing',
        displayName: 'Billing Bot',
        description: null,
        createdAt: MOCK_DATE,
        updatedAt: MOCK_DATE,
      });
      db.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      });

      const service = createInternalChatService(db);
      const result = await service.deleteExternalAccount({ accountId: 'acc_ext_1' });

      expect(result.accountId).toBe('acc_ext_1');
      expect(result.deleted).toBe(true);
      expect(db.delete).toHaveBeenCalled();
    });

    it('throws when account is not found', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(null);

      const service = createInternalChatService(db);
      await expect(
        service.deleteExternalAccount({ accountId: 'acc_nonexistent' }),
      ).rejects.toThrow('External account not found: acc_nonexistent');
    });

    it('throws when account belongs to an agent', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce({
        id: 'acc_agent',
        agentId: 'agent-123',
        slug: 'agent-123',
        displayName: 'Agent 123',
        description: null,
        createdAt: MOCK_DATE,
        updatedAt: MOCK_DATE,
      });

      const service = createInternalChatService(db);
      await expect(
        service.deleteExternalAccount({ accountId: 'acc_agent' }),
      ).rejects.toThrow('External account not found: acc_agent');
    });
  });
// =============================================================================
// CHUNK 2 — Account Queries
// Covers: listAccounts, getAccountBySlug, getAccountByAgentId
// Note: getAccountByTargetKey is internal (not in return block), excluded.
// =============================================================================

  describe('listAccounts', () => {
    it('returns all accounts when no exclusion is specified', async () => {
      db.query.internalChatAccounts.findMany.mockResolvedValueOnce([
        {
          id: 'acc_1',
          agentId: null,
          slug: 'slack-billing',
          displayName: 'Slack Billing',
          description: null,
          createdAt: MOCK_DATE,
          updatedAt: MOCK_DATE,
        },
        {
          id: 'acc_2',
          agentId: null,
          slug: 'github-ops',
          displayName: 'GitHub Ops',
          description: 'External',
          createdAt: MOCK_DATE,
          updatedAt: MOCK_DATE,
        },
      ]);

      const service = createInternalChatService(db);
      const result = await service.listAccounts();

      expect(result).toHaveLength(2);
      expect(result[0].slug).toBe('slack-billing');
      expect(result[1].slug).toBe('github-ops');
    });

    it('excludes the specified agentId when excludeAgentId is given', async () => {
      db.query.internalChatAccounts.findMany.mockResolvedValueOnce([
        {
          id: 'acc_ext',
          agentId: null,
          slug: 'slack-billing',
          displayName: 'Slack Billing',
          description: null,
          createdAt: MOCK_DATE,
          updatedAt: MOCK_DATE,
        },
      ]);

      const service = createInternalChatService(db);
      const result = await service.listAccounts({ excludeAgentId: 'agent-exclude-me' });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('acc_ext');
    });

    it('returns empty array when no accounts exist', async () => {
      db.query.internalChatAccounts.findMany.mockResolvedValueOnce([]);

      const service = createInternalChatService(db);
      const result = await service.listAccounts();

      expect(result).toHaveLength(0);
    });
  });

  describe('getAccountBySlug', () => {
    it('returns the account when found', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce({
        id: 'acc_ext_1',
        agentId: null,
        slug: 'github-ops',
        displayName: 'GitHub Ops',
        description: null,
        createdAt: MOCK_DATE,
        updatedAt: MOCK_DATE,
      });

      const service = createInternalChatService(db);
      const result = await service.getAccountBySlug('github-ops');

      expect(result?.slug).toBe('github-ops');
      expect(result?.displayName).toBe('GitHub Ops');
    });

    it('returns null when no account matches the slug', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(null);

      const service = createInternalChatService(db);
      const result = await service.getAccountBySlug('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getAccountByAgentId', () => {
    it('returns the account when an agent has one', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce({
        id: 'acc_agent_1',
        agentId: 'agent-kaelen',
        slug: 'kaelen',
        displayName: 'Kaelen',
        description: 'agent-kaelen (Kaelen)',
        createdAt: MOCK_DATE,
        updatedAt: MOCK_DATE,
      });

      const service = createInternalChatService(db);
      const result = await service.getAccountByAgentId('agent-kaelen');

      expect(result?.agentId).toBe('agent-kaelen');
      expect(result?.slug).toBe('kaelen');
    });

    it('returns null when no account belongs to the agent', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(null);

      const service = createInternalChatService(db);
      const result = await service.getAccountByAgentId('agent-nonexistent');

      expect(result).toBeNull();
    });
  });

// =============================================================================
// =============================================================================
// =============================================================================
// CHUNK 4 — Message Retrieval
// Covers: getMessages, getMessagesByAccount
// =============================================================================

  describe('getMessages', () => {
    it('returns messages for a conversation with unread set based on read status', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(MOCK_ACCOUNT_A);
      db.query.internalChatConversationMembers.findFirst.mockResolvedValueOnce({ accountId: 'acc_kaelen', conversationId: 'conv_1' });

      db.select
        .mockReturnValueOnce(createChain([
          { messageId: 'msg_1', content: 'Hello', createdAt: MOCK_NOW, authorAccountId: 'acc_other', authorDisplayName: 'Other', unread: 0 },
        ]))
        .mockReturnValueOnce(createChain([]));

      const updateChain = { set: () => ({ where: () => ({ all: () => Promise.resolve() }) }) };
      db.update.mockReturnValue(updateChain);

      const service = createInternalChatService(db);
      const result = await service.getMessages({ agentId: 'agent-kaelen', conversationKey: 'conv_1', limit: 20, offset: 0 });

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Hello');
      expect(result[0].provider).toBe('internal-chat');
    });

    it('marks unread messages as read', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(MOCK_ACCOUNT_A);
      db.query.internalChatConversationMembers.findFirst.mockResolvedValueOnce({ accountId: 'acc_kaelen', conversationId: 'conv_1' });

      db.select
        .mockReturnValueOnce(createChain([
          { messageId: 'msg_unread', content: 'Unread msg', createdAt: MOCK_NOW, authorAccountId: 'acc_other', authorDisplayName: 'Other', unread: 1 },
        ]))
        .mockReturnValueOnce(createChain([]));

      const updateChain = { set: () => ({ where: () => ({ all: () => Promise.resolve() }) }) };
      db.update.mockReturnValue(updateChain);

      const service = createInternalChatService(db);
      const result = await service.getMessages({ agentId: 'agent-kaelen', conversationKey: 'conv_1', limit: 20, offset: 0 });

      expect(result[0].unread).toBe(true);
    });

    it('applies dateFrom filter', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(MOCK_ACCOUNT_A);
      db.query.internalChatConversationMembers.findFirst.mockResolvedValueOnce({ accountId: 'acc_kaelen', conversationId: 'conv_1' });

      db.select.mockReturnValueOnce(createChain([]));
      const updateChain = { set: () => ({ where: () => ({ all: () => Promise.resolve() }) }) };
      db.update.mockReturnValue(updateChain);

      const service = createInternalChatService(db);
      const result = await service.getMessages({
        agentId: 'agent-kaelen', conversationKey: 'conv_1', limit: 20, offset: 0, dateFrom: '2025-01-01',
      });

      expect(result).toHaveLength(0);
    });

    it('applies query filter', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(MOCK_ACCOUNT_A);
      db.query.internalChatConversationMembers.findFirst.mockResolvedValueOnce({ accountId: 'acc_kaelen', conversationId: 'conv_1' });

      db.select.mockReturnValueOnce(createChain([]));
      const updateChain = { set: () => ({ where: () => ({ all: () => Promise.resolve() }) }) };
      db.update.mockReturnValue(updateChain);

      const service = createInternalChatService(db);
      const result = await service.getMessages({
        agentId: 'agent-kaelen', conversationKey: 'conv_1', limit: 20, offset: 0, query: 'hello',
      });

      expect(result).toHaveLength(0);
    });

    it('throws when agent has no account', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(null);

      const service = createInternalChatService(db);
      await expect(
        service.getMessages({ agentId: 'agent-nonexistent', conversationKey: 'conv_1', limit: 20, offset: 0 }),
      ).rejects.toThrow('Internal chat account not found for agent');
    });

    it('throws when conversation not found', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(MOCK_ACCOUNT_A);
      db.query.internalChatConversationMembers.findFirst.mockResolvedValueOnce(null);

      const service = createInternalChatService(db);
      await expect(
        service.getMessages({ agentId: 'agent-kaelen', conversationKey: 'conv_1', limit: 20, offset: 0 }),
      ).rejects.toThrow('Conversation not found: conv_1');
    });
  });

  describe('getMessagesByAccount', () => {
    it('returns messages for an external account conversation', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce({
        id: 'acc_ext_1', agentId: null, slug: 'slack-ops', displayName: 'Slack Ops', description: null, createdAt: MOCK_DATE, updatedAt: MOCK_DATE,
      });
      db.query.internalChatConversationMembers.findFirst.mockResolvedValueOnce({ accountId: 'acc_ext_1', conversationId: 'conv_1' });

      db.select
        .mockReturnValueOnce(createChain([
          { messageId: 'msg_1', content: 'From external', createdAt: MOCK_NOW, authorAccountId: 'acc_ext_1', authorDisplayName: 'Slack Ops' },
        ]))
        .mockReturnValueOnce(createChain([]));

      const service = createInternalChatService(db);
      const result = await service.getMessagesByAccount({ accountId: 'acc_ext_1', conversationKey: 'conv_1', limit: 20, offset: 0 });

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('From external');
    });

    it('throws when account not found', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(null);

      const service = createInternalChatService(db);
      await expect(
        service.getMessagesByAccount({ accountId: 'acc-nonexistent', conversationKey: 'conv_1', limit: 20, offset: 0 }),
      ).rejects.toThrow('Conversation not found: conv_1');
    });

    it('applies dateTo filter', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce({
        id: 'acc_ext_1', agentId: null, slug: 'slack-ops', displayName: 'Slack Ops', description: null, createdAt: MOCK_DATE, updatedAt: MOCK_DATE,
      });
      db.query.internalChatConversationMembers.findFirst.mockResolvedValueOnce({ accountId: 'acc_ext_1', conversationId: 'conv_1' });

      db.select.mockReturnValueOnce(createChain([]));

      const service = createInternalChatService(db);
      const result = await service.getMessagesByAccount({
        accountId: 'acc_ext_1', conversationKey: 'conv_1', limit: 20, offset: 0, dateTo: '2025-12-31',
      });

      expect(result).toHaveLength(0);
    });

    it('throws when account has no conversation membership', async () => {
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce({
        id: 'acc_ext_1', agentId: null, slug: 'slack-ops', displayName: 'Slack Ops', description: null, createdAt: MOCK_DATE, updatedAt: MOCK_DATE,
      });
      db.query.internalChatConversationMembers.findFirst.mockResolvedValueOnce(null);

      const service = createInternalChatService(db);
      await expect(
        service.getMessagesByAccount({ accountId: 'acc_ext_1', conversationKey: 'conv_1', limit: 20, offset: 0 }),
      ).rejects.toThrow('Conversation not found: conv_1');
    });
  });

});