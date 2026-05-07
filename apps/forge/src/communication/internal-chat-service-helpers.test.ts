/**
 * Unit tests for communication/internal-chat-service-helpers.ts.
 * createServiceHelpers — permission-checking and lookup helpers.
 * Extracted from #1555 refactor. Zero prior coverage.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createServiceHelpers,
  type ServiceHelpersDeps,
} from './internal-chat-service-helpers';
import {
  ConversationNotFoundError,
  ChatGroupNotFoundError,
  ExternalAccountNotFoundError,
  InternalChatAccountNotFoundError,
} from './internal-chat-errors';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<ServiceHelpersDeps> = {}): ServiceHelpersDeps {
  return {
    db: {
      query: {
        internalChatConversationMembers: { findFirst: vi.fn() },
        internalChatConversations: { findFirst: vi.fn() },
      },
    } as unknown as ServiceHelpersDeps['db'],
    accounts: {
      getRequiredAccount: vi.fn(),
      getRequiredAgentAccount: vi.fn(),
      getAccountBySlug: vi.fn(),
    },
    participants: {
      listGroupMembersOrDmPeers: vi.fn(),
      listGroupMembersOrDmPeersByAccount: vi.fn(),
    },
    ...overrides,
  };
}

const ACCOUNT_HUMAN = { id: 'acct-1', agentId: null, slug: 'alice', displayName: 'Alice' };
const ACCOUNT_AGENT = { id: 'acct-2', agentId: 'agent-1', slug: 'agent-1', displayName: 'Agent One' };
const CONV_DM = { id: 'conv-1', type: 'dm' as const, name: null };
const CONV_GROUP = { id: 'conv-2', type: 'group' as const, name: 'Team' };
const MEMBER_ROW = { accountId: 'acct-1', conversationId: 'conv-1' };

// ─── getRequiredAccount ───────────────────────────────────────────────────────

describe('getRequiredAccount', () => {
  it('delegates to accounts.getRequiredAccount', async () => {
    const deps = makeDeps();
    vi.mocked(deps.accounts.getRequiredAccount).mockResolvedValue(ACCOUNT_HUMAN);
    const helpers = createServiceHelpers(deps);
    const result = await helpers.getRequiredAccount('acct-1');
    expect(result).toBe(ACCOUNT_HUMAN);
    expect(deps.accounts.getRequiredAccount).toHaveBeenCalledWith('acct-1');
  });
});

// ─── getRequiredAgentAccount ──────────────────────────────────────────────────

describe('getRequiredAgentAccount', () => {
  it('delegates to accounts.getRequiredAgentAccount', async () => {
    const deps = makeDeps();
    vi.mocked(deps.accounts.getRequiredAgentAccount).mockResolvedValue(ACCOUNT_AGENT);
    const helpers = createServiceHelpers(deps);
    const result = await helpers.getRequiredAgentAccount('agent-1');
    expect(result).toBe(ACCOUNT_AGENT);
    expect(deps.accounts.getRequiredAgentAccount).toHaveBeenCalledWith('agent-1');
  });
});

// ─── getRequiredExternalAccount ────────────────────────────────────────────────

describe('getRequiredExternalAccount', () => {
  it('returns account when agentId is null (human account)', async () => {
    const deps = makeDeps();
    vi.mocked(deps.accounts.getRequiredAccount).mockResolvedValue(ACCOUNT_HUMAN);
    const helpers = createServiceHelpers(deps);
    const result = await helpers.getRequiredExternalAccount('acct-1');
    expect(result).toBe(ACCOUNT_HUMAN);
  });

  it('throws ExternalAccountNotFoundError when account has agentId', async () => {
    const deps = makeDeps();
    vi.mocked(deps.accounts.getRequiredAccount).mockResolvedValue(ACCOUNT_AGENT);
    const helpers = createServiceHelpers(deps);
    await expect(helpers.getRequiredExternalAccount('acct-2')).rejects.toThrow(ExternalAccountNotFoundError);
  });

  it('passes through errors from accounts.getRequiredAccount', async () => {
    const deps = makeDeps();
    const err = new Error('db error');
    vi.mocked(deps.accounts.getRequiredAccount).mockRejectedValue(err);
    const helpers = createServiceHelpers(deps);
    await expect(helpers.getRequiredExternalAccount('acct-1')).rejects.toThrow('db error');
  });
});

// ─── getRequiredAccountBySlug ──────────────────────────────────────────────────

describe('getRequiredAccountBySlug', () => {
  it('returns account when found by slug', async () => {
    const deps = makeDeps();
    vi.mocked(deps.accounts.getAccountBySlug).mockResolvedValue(ACCOUNT_HUMAN);
    const helpers = createServiceHelpers(deps);
    const result = await helpers.getRequiredAccountBySlug('alice');
    expect(result).toBe(ACCOUNT_HUMAN);
    expect(deps.accounts.getAccountBySlug).toHaveBeenCalledWith('alice');
  });

  it('throws InternalChatAccountNotFoundError when account not found', async () => {
    const deps = makeDeps();
    vi.mocked(deps.accounts.getAccountBySlug).mockResolvedValue(null);
    const helpers = createServiceHelpers(deps);
    await expect(helpers.getRequiredAccountBySlug('unknown-slug')).rejects.toThrow(InternalChatAccountNotFoundError);
  });

  it('InternalChatAccountNotFoundError includes the slug', async () => {
    const deps = makeDeps();
    vi.mocked(deps.accounts.getAccountBySlug).mockResolvedValue(null);
    const helpers = createServiceHelpers(deps);
    try {
      await helpers.getRequiredAccountBySlug('missing-slug');
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as InternalChatAccountNotFoundError).slug).toBe('missing-slug');
    }
  });
});

// ─── requireConversationMembership ────────────────────────────────────────────

describe('requireConversationMembership', () => {
  it('resolves agent account then checks membership', async () => {
    const deps = makeDeps();
    vi.mocked(deps.accounts.getRequiredAgentAccount).mockResolvedValue(ACCOUNT_AGENT);
    vi.mocked(deps.db.query.internalChatConversationMembers.findFirst).mockResolvedValue(MEMBER_ROW);
    const helpers = createServiceHelpers(deps);
    await expect(helpers.requireConversationMembership('agent-1', 'conv-1')).resolves.toBeUndefined();
    expect(deps.accounts.getRequiredAgentAccount).toHaveBeenCalledWith('agent-1');
  });
});

// ─── requireConversationMembershipByAccount ───────────────────────────────────

describe('requireConversationMembershipByAccount', () => {
  it('succeeds when membership row found', async () => {
    const deps = makeDeps();
    vi.mocked(deps.db.query.internalChatConversationMembers.findFirst).mockResolvedValue(MEMBER_ROW);
    const helpers = createServiceHelpers(deps);
    await expect(helpers.requireConversationMembershipByAccount('acct-1', 'conv-1')).resolves.toBeUndefined();
  });

  it('throws ConversationNotFoundError when membership not found', async () => {
    const deps = makeDeps();
    vi.mocked(deps.db.query.internalChatConversationMembers.findFirst).mockResolvedValue(null);
    const helpers = createServiceHelpers(deps);
    await expect(helpers.requireConversationMembershipByAccount('acct-1', 'conv-missing')).rejects.toThrow(
      ConversationNotFoundError,
    );
  });

  it('ConversationNotFoundError includes the conversationId', async () => {
    const deps = makeDeps();
    vi.mocked(deps.db.query.internalChatConversationMembers.findFirst).mockResolvedValue(null);
    const helpers = createServiceHelpers(deps);
    try {
      await helpers.requireConversationMembershipByAccount('acct-1', 'conv-xyz');
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as ConversationNotFoundError).conversationId).toBe('conv-xyz');
    }
  });
});

// ─── getRequiredConversationForAgent ──────────────────────────────────────────

describe('getRequiredConversationForAgent', () => {
  it('resolves account then fetches conversation', async () => {
    const deps = makeDeps();
    vi.mocked(deps.accounts.getRequiredAgentAccount).mockResolvedValue(ACCOUNT_AGENT);
    vi.mocked(deps.db.query.internalChatConversationMembers.findFirst).mockResolvedValue(MEMBER_ROW);
    vi.mocked(deps.db.query.internalChatConversations.findFirst).mockResolvedValue(CONV_DM);
    const helpers = createServiceHelpers(deps);
    const result = await helpers.getRequiredConversationForAgent('agent-1', 'conv-1');
    expect(result).toEqual(CONV_DM);
  });
});

// ─── getRequiredConversationForAccount ───────────────────────────────────────

describe('getRequiredConversationForAccount', () => {
  it('returns conversation when membership exists', async () => {
    const deps = makeDeps();
    vi.mocked(deps.db.query.internalChatConversationMembers.findFirst).mockResolvedValue(MEMBER_ROW);
    vi.mocked(deps.db.query.internalChatConversations.findFirst).mockResolvedValue(CONV_GROUP);
    const helpers = createServiceHelpers(deps);
    const result = await helpers.getRequiredConversationForAccount('acct-1', 'conv-2');
    expect(result).toEqual(CONV_GROUP);
  });

  it('throws ConversationNotFoundError when membership missing', async () => {
    const deps = makeDeps();
    vi.mocked(deps.db.query.internalChatConversationMembers.findFirst).mockResolvedValue(null);
    const helpers = createServiceHelpers(deps);
    await expect(helpers.getRequiredConversationForAccount('acct-1', 'conv-1')).rejects.toThrow(
      ConversationNotFoundError,
    );
  });

  it('throws ConversationNotFoundError when conversation not found', async () => {
    const deps = makeDeps();
    vi.mocked(deps.db.query.internalChatConversationMembers.findFirst).mockResolvedValue(MEMBER_ROW);
    vi.mocked(deps.db.query.internalChatConversations.findFirst).mockResolvedValue(null);
    const helpers = createServiceHelpers(deps);
    await expect(helpers.getRequiredConversationForAccount('acct-1', 'conv-1')).rejects.toThrow(
      ConversationNotFoundError,
    );
  });
});

// ─── getRequiredGroupForAgent / getRequiredGroupForAccount ─────────────────────

describe('getRequiredGroupForAgent', () => {
  it('returns group conversation', async () => {
    const deps = makeDeps();
    vi.mocked(deps.accounts.getRequiredAgentAccount).mockResolvedValue(ACCOUNT_AGENT);
    vi.mocked(deps.db.query.internalChatConversationMembers.findFirst).mockResolvedValue({ ...MEMBER_ROW, conversationId: 'conv-2' });
    vi.mocked(deps.db.query.internalChatConversations.findFirst).mockResolvedValue(CONV_GROUP);
    const helpers = createServiceHelpers(deps);
    const result = await helpers.getRequiredGroupForAgent('agent-1', 'conv-2');
    expect(result).toEqual(CONV_GROUP);
  });

  it('throws ChatGroupNotFoundError when conversation is a DM', async () => {
    const deps = makeDeps();
    vi.mocked(deps.accounts.getRequiredAgentAccount).mockResolvedValue(ACCOUNT_AGENT);
    vi.mocked(deps.db.query.internalChatConversationMembers.findFirst).mockResolvedValue(MEMBER_ROW);
    vi.mocked(deps.db.query.internalChatConversations.findFirst).mockResolvedValue(CONV_DM);
    const helpers = createServiceHelpers(deps);
    await expect(helpers.getRequiredGroupForAgent('agent-1', 'conv-1')).rejects.toThrow(ChatGroupNotFoundError);
  });
});

describe('getRequiredGroupForAccount', () => {
  it('returns group conversation', async () => {
    const deps = makeDeps();
    vi.mocked(deps.db.query.internalChatConversationMembers.findFirst).mockResolvedValue({ ...MEMBER_ROW, conversationId: 'conv-2' });
    vi.mocked(deps.db.query.internalChatConversations.findFirst).mockResolvedValue(CONV_GROUP);
    const helpers = createServiceHelpers(deps);
    const result = await helpers.getRequiredGroupForAccount('acct-1', 'conv-2');
    expect(result).toEqual(CONV_GROUP);
  });

  it('throws ChatGroupNotFoundError when conversation is a DM', async () => {
    const deps = makeDeps();
    vi.mocked(deps.db.query.internalChatConversationMembers.findFirst).mockResolvedValue(MEMBER_ROW);
    vi.mocked(deps.db.query.internalChatConversations.findFirst).mockResolvedValue(CONV_DM);
    const helpers = createServiceHelpers(deps);
    await expect(helpers.getRequiredGroupForAccount('acct-1', 'conv-1')).rejects.toThrow(ChatGroupNotFoundError);
  });

  it('ChatGroupNotFoundError includes the groupId', async () => {
    const deps = makeDeps();
    vi.mocked(deps.db.query.internalChatConversationMembers.findFirst).mockResolvedValue(MEMBER_ROW);
    vi.mocked(deps.db.query.internalChatConversations.findFirst).mockResolvedValue(CONV_DM);
    const helpers = createServiceHelpers(deps);
    try {
      await helpers.getRequiredGroupForAccount('acct-1', 'conv-99');
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as ChatGroupNotFoundError).groupId).toBe('conv-99');
    }
  });
});

// ─── listGroupMembersOrDmPeers / listGroupMembersOrDmPeersByAccount ────────────

describe('listGroupMembersOrDmPeers', () => {
  it('delegates to participants.listGroupMembersOrDmPeers', async () => {
    const deps = makeDeps();
    const mockMembers = [{ accountId: 'acct-1', displayName: 'Alice' }];
    vi.mocked(deps.participants.listGroupMembersOrDmPeers).mockResolvedValue(mockMembers);
    const helpers = createServiceHelpers(deps);
    const result = await helpers.listGroupMembersOrDmPeers('agent-1', 'conv-1');
    expect(result).toBe(mockMembers);
    expect(deps.participants.listGroupMembersOrDmPeers).toHaveBeenCalledWith('agent-1', 'conv-1');
  });
});

describe('listGroupMembersOrDmPeersByAccount', () => {
  it('delegates to participants.listGroupMembersOrDmPeersByAccount', async () => {
    const deps = makeDeps();
    const mockMembers = [{ accountId: 'acct-2', displayName: 'Bob' }];
    vi.mocked(deps.participants.listGroupMembersOrDmPeersByAccount).mockResolvedValue(mockMembers);
    const helpers = createServiceHelpers(deps);
    const result = await helpers.listGroupMembersOrDmPeersByAccount('acct-1', 'conv-5');
    expect(result).toBe(mockMembers);
    expect(deps.participants.listGroupMembersOrDmPeersByAccount).toHaveBeenCalledWith('acct-1', 'conv-5');
  });
});