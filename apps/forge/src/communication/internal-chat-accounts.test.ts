import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInternalChatAccounts } from './internal-chat-accounts';
import { InternalChatAccountNotFoundError, InternalChatError } from './internal-chat-errors';

// ---------------------------------------------------------------------------
// Chain builder for db.select().from().where().all() chains
// ---------------------------------------------------------------------------
function createChain(result: unknown) {
  const chain: Record<string, unknown> = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    all: vi.fn(() => Promise.resolve(result)),
  };
  chain[Symbol.iterator] = function* () {
    yield* (result as unknown[]);
  };
  Object.defineProperty(chain, 'then', {
    value: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled),
    configurable: true,
    writable: true,
  });
  return chain;
}

// ---------------------------------------------------------------------------
// Mock DB factory
// ---------------------------------------------------------------------------
function createMockDb(overrides?: {
  accounts?: unknown[];
}) {
  const accounts = overrides?.accounts ?? [];

  return {
    query: {
      internalChatAccounts: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue(accounts),
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
    },
    select: vi.fn(() => createChain([])),
    insert: vi.fn(() => ({
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{}]),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue({}),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue({}),
    })),
  };
}

// ---------------------------------------------------------------------------
// Shared fixture accounts
// ---------------------------------------------------------------------------
const AGENT_ACCOUNT = {
  id: 'acct_agent_001',
  agentId: 'agent_001',
  slug: 'agent-alpha',
  displayName: 'Agent Alpha',
  description: 'A helpful agent',
  type: null,
  createdAt: 1710000000000,
  updatedAt: 1710000000000,
};

const EXTERNAL_ACCOUNT = {
  id: 'acct_ext_001',
  agentId: null,
  slug: 'alice-external',
  displayName: 'Alice',
  description: 'External user',
  type: 'external',
  createdAt: 1710000000000,
  updatedAt: 1710000000000,
};

const DM_CONVERSATION = {
  id: 'conv_dm_001',
  type: 'dm',
  name: null,
  createdByAccountId: 'acct_agent_001',
  createdAt: 1710000000000,
  updatedAt: 1710000000000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('createInternalChatAccounts', () => {
  let accounts: ReturnType<typeof createInternalChatAccounts>;
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb({ accounts: [] });
    accounts = createInternalChatAccounts(db as unknown as import('../database/index').Database);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── registerAgentAccount ──────────────────────────────────────────────────

  describe('registerAgentAccount', () => {
    it('registers a new agent account', async () => {
      const existingAgent = { ...AGENT_ACCOUNT, id: 'acct_agent_000', agentId: 'agent_000' };
      const testDb = createMockDb({ accounts: [existingAgent] });
      const testAccounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);

      const result = await testAccounts.registerAgentAccount({
        agentId: 'agent_001',
        displayName: 'Agent Alpha',
        agentName: 'Alpha',
        agentDescription: 'Helpful',
        roleName: 'assistant',
        roleDescription: 'General assistant',
      });

      expect(result.agentId).toBe('agent_001');
      expect(result.displayName).toBe('Agent Alpha');
      expect(typeof result.accountId).toBe('string');
      expect(result.accountId.startsWith('acct_')).toBe(true);
      expect(testDb.insert).toHaveBeenCalled();
    });

    it('updates existing agent account when already registered', async () => {
      const testDb = createMockDb({ accounts: [AGENT_ACCOUNT] });
      (testDb.query.internalChatAccounts.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(AGENT_ACCOUNT);
      const testAccounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);

      const result = await testAccounts.registerAgentAccount({
        agentId: 'agent_001',
        displayName: 'Agent Alpha Updated',
        agentName: 'Alpha',
      });

      expect(result.accountId).toBe('acct_agent_001');
      expect(result.displayName).toBe('Agent Alpha Updated');
      expect(testDb.update).toHaveBeenCalled();
    });
  });

  // ── registerExternalAccount ──────────────────────────────────────────────

  describe('registerExternalAccount', () => {
    it('registers a new external account', async () => {
      const result = await accounts.registerExternalAccount({
        slug: 'alice-external',
        displayName: 'Alice',
        description: 'External user',
      });

      expect(result.slug).toBe('alice-external');
      expect(typeof result.accountId).toBe('string');
      expect(result.accountId.startsWith('acct_')).toBe(true);
      expect(db.insert).toHaveBeenCalled();
    });

    it('propagates errors from db.insert', async () => {
      db.insert = vi.fn().mockImplementation(() => {
        throw new Error('UNIQUE constraint failed');
      });
      accounts = createInternalChatAccounts(db as unknown as import('../database/index').Database);

      await expect(
        accounts.registerExternalAccount({ slug: 'dup', displayName: 'Dup' }),
      ).rejects.toThrow('UNIQUE constraint failed');
    });
  });

  // ── updateExternalAccount ─────────────────────────────────────────────────

  describe('updateExternalAccount', () => {
    it('updates display name and description', async () => {
      await accounts.updateExternalAccount({
        accountId: 'acct_ext_001',
        displayName: 'Alice Updated',
        description: 'New description',
      });

      expect(db.update).toHaveBeenCalled();
    });

    it('propagates errors from db.update', async () => {
      db.update = vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation(() => {
          throw new Error('update failed');
        }),
      }));
      accounts = createInternalChatAccounts(db as unknown as import('../database/index').Database);

      await expect(
        accounts.updateExternalAccount({ accountId: 'acct_ext_001', displayName: 'X' }),
      ).rejects.toThrow('update failed');
    });
  });

  // ── deleteExternalAccount ─────────────────────────────────────────────────

  describe('deleteExternalAccount', () => {
    it('deletes the account by id', async () => {
      await accounts.deleteExternalAccount({ accountId: 'acct_ext_001' });

      expect(db.delete).toHaveBeenCalled();
    });

    it('propagates errors from db.delete', async () => {
      db.delete = vi.fn().mockImplementation(() => {
        throw new Error('delete failed');
      });
      accounts = createInternalChatAccounts(db as unknown as import('../database/index').Database);

      await expect(
        accounts.deleteExternalAccount({ accountId: 'acct_ext_001' }),
      ).rejects.toThrow('delete failed');
    });
  });

  // ── listAccounts ─────────────────────────────────────────────────────────

  describe('listAccounts', () => {
    it('returns all accounts when no filter', async () => {
      const testDb = createMockDb({ accounts: [AGENT_ACCOUNT, EXTERNAL_ACCOUNT] });
      const testAccounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);

      const result = await testAccounts.listAccounts();

      expect(result).toHaveLength(2);
      expect(testDb.query.internalChatAccounts.findMany).toHaveBeenCalledWith({});
    });

    it('filters accounts when excludeAgentId is provided', async () => {
      const testDb = createMockDb({ accounts: [AGENT_ACCOUNT, EXTERNAL_ACCOUNT] });
      const testAccounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);

      const result = await testAccounts.listAccounts({ excludeAgentId: 'agent_001' });

      expect(testDb.query.internalChatAccounts.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.any(Object) }),
      );
    });

    it('propagates errors from db.query.findMany', async () => {
      db.query.internalChatAccounts.findMany = vi.fn().mockRejectedValue(new Error('query failed'));
      accounts = createInternalChatAccounts(db as unknown as import('../database/index').Database);

      await expect(accounts.listAccounts()).rejects.toThrow('query failed');
    });
  });

  // ── getAccountBySlug ─────────────────────────────────────────────────────

  describe('getAccountBySlug', () => {
    it('returns account when found', async () => {
      const testDb = createMockDb({ accounts: [EXTERNAL_ACCOUNT] });
      (testDb.query.internalChatAccounts.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(EXTERNAL_ACCOUNT);
      const testAccounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);

      const result = await testAccounts.getAccountBySlug('alice-external');

      expect(result).toEqual(EXTERNAL_ACCOUNT);
    });

    it('returns null when not found', async () => {
      const testDb = createMockDb({ accounts: [] });
      (testDb.query.internalChatAccounts.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null);
      const testAccounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);

      const result = await testAccounts.getAccountBySlug('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ── getAccountByAgentId ──────────────────────────────────────────────────

  describe('getAccountByAgentId', () => {
    it('returns account when found', async () => {
      const testDb = createMockDb({ accounts: [AGENT_ACCOUNT] });
      (testDb.query.internalChatAccounts.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(AGENT_ACCOUNT);
      const testAccounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);

      const result = await testAccounts.getAccountByAgentId('agent_001');

      expect(result).toEqual(AGENT_ACCOUNT);
    });

    it('returns null when not found', async () => {
      const testDb = createMockDb({ accounts: [] });
      (testDb.query.internalChatAccounts.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null);
      const testAccounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);

      const result = await testAccounts.getAccountByAgentId('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ── getAccountByTargetKey ─────────────────────────────────────────────────

  describe('getAccountByTargetKey', () => {
    it('returns account when found by slug', async () => {
      const testDb = createMockDb({ accounts: [EXTERNAL_ACCOUNT] });
      (testDb.query.internalChatAccounts.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(EXTERNAL_ACCOUNT)
        .mockResolvedValueOnce(null);
      const accounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);
      const result = await accounts.getAccountByTargetKey('test-external');
      expect(result).toEqual(EXTERNAL_ACCOUNT);
    });

    it('returns account when found by id', async () => {
      const testDb = createMockDb({ accounts: [EXTERNAL_ACCOUNT] });
      (testDb.query.internalChatAccounts.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(EXTERNAL_ACCOUNT);
      const accounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);
      const result = await accounts.getAccountByTargetKey('ext-acc-1');
      expect(result).toEqual(EXTERNAL_ACCOUNT);
    });

    it('returns null when not found', async () => {
      const testDb = createMockDb({ accounts: [EXTERNAL_ACCOUNT] });
      (testDb.query.internalChatAccounts.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      const accounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);
      const result = await accounts.getAccountByTargetKey('nonexistent');
      expect(result).toBeNull();
    });
  });

  // ── getRequiredAccount ───────────────────────────────────────────────────

  describe('getRequiredAccount', () => {
    it('returns account when found', async () => {
      const testDb = createMockDb({ accounts: [EXTERNAL_ACCOUNT] });
      (testDb.query.internalChatAccounts.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(EXTERNAL_ACCOUNT);
      const testAccounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);

      const result = await testAccounts.getRequiredAccount('acct_ext_001');

      expect(result).toEqual(EXTERNAL_ACCOUNT);
    });

    it('throws InternalChatAccountNotFoundError when not found', async () => {
      const testDb = createMockDb({ accounts: [] });
      (testDb.query.internalChatAccounts.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null);
      const testAccounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);

      await expect(testAccounts.getRequiredAccount('nonexistent')).rejects.toThrow(
        InternalChatAccountNotFoundError,
      );
    });
  });

  // ── getRequiredAgentAccount ───────────────────────────────────────────────

  describe('getRequiredAgentAccount', () => {
    it('returns account when found', async () => {
      const testDb = createMockDb({ accounts: [AGENT_ACCOUNT] });
      (testDb.query.internalChatAccounts.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(AGENT_ACCOUNT);
      const testAccounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);

      const result = await testAccounts.getRequiredAgentAccount('agent_001');

      expect(result).toEqual(AGENT_ACCOUNT);
    });

    it('throws InternalChatAccountNotFoundError when not found', async () => {
      const testDb = createMockDb({ accounts: [] });
      (testDb.query.internalChatAccounts.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null);
      const testAccounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);

      await expect(testAccounts.getRequiredAgentAccount('nonexistent')).rejects.toThrow(
        InternalChatAccountNotFoundError,
      );
    });
  });

  // ── getRequiredAccountBySlug ─────────────────────────────────────────────

  describe('getRequiredAccountBySlug', () => {
    it('returns account when found', async () => {
      const testDb = createMockDb({ accounts: [EXTERNAL_ACCOUNT] });
      (testDb.query.internalChatAccounts.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(EXTERNAL_ACCOUNT);
      const testAccounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);

      const result = await testAccounts.getRequiredAccountBySlug('alice-external');

      expect(result).toEqual(EXTERNAL_ACCOUNT);
    });

    it('throws InternalChatAccountNotFoundError when not found', async () => {
      const testDb = createMockDb({ accounts: [] });
      (testDb.query.internalChatAccounts.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null);
      const testAccounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);

      await expect(testAccounts.getRequiredAccountBySlug('nonexistent')).rejects.toThrow(
        InternalChatAccountNotFoundError,
      );
    });
  });

  // ── getConversationForAgent ──────────────────────────────────────────────

  describe('getConversationForAgent', () => {
    it('returns conversation when found', async () => {
      const testDb = createMockDb({ accounts: [AGENT_ACCOUNT] });
      (testDb.query.internalChatAccounts.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(AGENT_ACCOUNT); // account lookup
      (testDb.query.internalChatConversations.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(DM_CONVERSATION); // conversation lookup
      const testAccounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);

      const result = await testAccounts.getConversationForAgent('agent_001', 'conv_dm_001');

      expect(result).toEqual(DM_CONVERSATION);
    });

    it('throws InternalChatError when no account found for agent', async () => {
      const testDb = createMockDb({ accounts: [] });
      (testDb.query.internalChatAccounts.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null);
      const testAccounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);

      await expect(
        testAccounts.getConversationForAgent('agent_001', 'conv_dm_001'),
      ).rejects.toThrow(InternalChatError);
    });

    it('throws InternalChatError when conversation not found', async () => {
      const testDb = createMockDb({ accounts: [AGENT_ACCOUNT] });
      (testDb.query.internalChatAccounts.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(AGENT_ACCOUNT); // account lookup
      (testDb.query.internalChatConversations.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null); // conversation not found
      const testAccounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);

      await expect(
        testAccounts.getConversationForAgent('agent_001', 'nonexistent'),
      ).rejects.toThrow(InternalChatError);
    });
  });

  // ── ensureDirectConversation ─────────────────────────────────────────────

  describe('ensureDirectConversation', () => {
    it('returns existing DM conversation when one exists between two accounts', async () => {
      const testDb = createMockDb({ accounts: [AGENT_ACCOUNT, EXTERNAL_ACCOUNT] });
      testDb.select = vi.fn().mockReturnValue(createChain([
        { conversationId: 'conv_dm_001' },
        { conversationId: 'conv_dm_001' },
      ]));
      (testDb.query.internalChatConversations.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(DM_CONVERSATION);
      const testAccounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);

      const result = await testAccounts.ensureDirectConversation('acct_agent_001', 'acct_ext_001');

      expect(result).toEqual(DM_CONVERSATION);
    });

    it('creates a new DM conversation when none exists', async () => {
      const testDb = createMockDb({ accounts: [AGENT_ACCOUNT, EXTERNAL_ACCOUNT] });
      testDb.select = vi.fn().mockReturnValue(createChain([]));
      const newConv = { id: 'conv_new_001', type: 'dm', name: null, createdByAccountId: 'acct_agent_001', createdAt: 1710000000000, updatedAt: 1710000000000 };
      const findFirstMock = testDb.query.internalChatConversations.findFirst as ReturnType<typeof vi.fn>;
      findFirstMock.mockReturnValueOnce(null).mockReturnValueOnce(newConv);
      const testAccounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);

      const result = await testAccounts.ensureDirectConversation('acct_agent_001', 'acct_ext_001');

      expect(result).toBeDefined();
      expect(testDb.insert).toHaveBeenCalled();
    });
  });

  // ── listGroupMembersOrDmPeersByAccount ───────────────────────────────────

  describe('listGroupMembersOrDmPeersByAccount', () => {
    it('returns members for a conversation', async () => {
      const mockRows = [
        { accountId: 'acct_1', agentId: 'agent_1', slug: 'a1', displayName: 'Agent 1' },
        { accountId: 'acct_2', agentId: null, slug: 'ext-1', displayName: 'Ext 1' },
      ];
      const testDb = createMockDb({ accounts: [AGENT_ACCOUNT] });
      testDb.select = vi.fn().mockReturnValue(createChain(mockRows));
      const testAccounts = createInternalChatAccounts(testDb as unknown as import('../database/index').Database);

      const result = await testAccounts.listGroupMembersOrDmPeersByAccount('acct_1', 'conv_001');

      expect(result).toBeDefined();
    });
  });
});
