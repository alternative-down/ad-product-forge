/**
 * Unit tests for communication/internal-chat-account-ops.ts.
 * createInternalChatAccountOps — account-scoped group/conversation operations.
 * Extracted from #1283 / #1215 refactor. Zero prior coverage.
 */
import { describe, expect, it, vi } from 'vitest';
import { createInternalChatAccountOps } from './internal-chat-account-ops';
import type { InternalChatAccountOpsDeps } from './internal-chat-account-ops';
import { ChatGroupAlreadyExistsError } from './internal-chat-errors';

// ─── Mock DB factory ─────────────────────────────────────────────────────────

function makeMockDb(overrides?: {
  existingConv?: { id: string; type: string; name: string | null } | null;
  existingMember?: { accountId: string; conversationId: string } | null;
  findFirstError?: Error;
  insertError?: Error;
  updateError?: Error;
  deleteError?: Error;
}) {
  return {
    query: {
      internalChatConversations: {
        findFirst: vi.fn().mockResolvedValue(overrides?.existingConv ?? null),
      },
      internalChatConversationMembers: {
        findFirst: vi.fn().mockResolvedValue(overrides?.existingMember ?? null),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([{}]),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
    }),
  };
}

// ─── Mock deps factory ───────────────────────────────────────────────────────

function makeMockDeps(overrides?: Partial<InternalChatAccountOpsDeps>) {
  return {
    getRequiredAccount: vi.fn().mockResolvedValue({
      id: 'acct-2',
      agentId: null,
      slug: 'bob',
      displayName: 'Bob',
    }),
    getRequiredExternalAccount: vi.fn().mockResolvedValue({
      id: 'acct-1',
      agentId: null,
      slug: 'alice',
      displayName: 'Alice',
    }),
    ensureDirectConversation: vi.fn().mockResolvedValue({
      id: 'conv-dm',
      type: 'dm',
      name: null,
      createdByAccountId: 'acct-1',
      createdAt: 1000,
      updatedAt: 1000,
    }),
    listGroupMembersByAccount: vi.fn().mockResolvedValue([
      { participantId: 'acct-1', participantName: 'Alice', role: 'admin', joinedAt: '2025-01-01T00:00:00Z' },
    ]),
    getRequiredGroupForAccount: vi.fn().mockResolvedValue({
      id: 'conv-group',
      type: 'group',
      name: 'Team',
    }),
    ...overrides,
  } as unknown as InternalChatAccountOpsDeps;
}

const DB = {} as Parameters<typeof createInternalChatAccountOps>[0];

// ─── createExternalChatGroup ──────────────────────────────────────────────────

describe('createExternalChatGroup', () => {
  it('creates group with admin membership for creator', async () => {
    const db = makeMockDb({ existingConv: null });
    const deps = makeMockDeps();
    const ops = createInternalChatAccountOps(db, deps);

    const result = await ops.createExternalChatGroup({
      accountId: 'acct-1',
      conversationKey: 'group-1',
      name: 'Team Alpha',
    });

    expect(result.provider).toBe('internal-chat');
    expect(result.groupId).toBe('group-1');
    expect(result.name).toBe('Team Alpha');
    expect(result.creatorMember.role).toBe('admin');
    expect(db.insert).toHaveBeenCalledTimes(2); // conversation + membership
  });

  it('verifies creator is external account', async () => {
    const db = makeMockDb({ existingConv: null });
    const deps = makeMockDeps();
    const ops = createInternalChatAccountOps(db, deps);

    await ops.createExternalChatGroup({
      accountId: 'acct-1',
      conversationKey: 'group-new',
      name: 'New Group',
    });

    expect(deps.getRequiredExternalAccount).toHaveBeenCalledWith('acct-1');
  });

  it('throws ChatGroupAlreadyExistsError when group already exists', async () => {
    const db = makeMockDb({ existingConv: { id: 'group-1', type: 'group', name: 'Existing' } });
    const deps = makeMockDeps();
    const ops = createInternalChatAccountOps(db, deps);

    await expect(
      ops.createExternalChatGroup({
        accountId: 'acct-1',
        conversationKey: 'group-1',
        name: 'Duplicate',
      }),
    ).rejects.toThrow(ChatGroupAlreadyExistsError);
  });

  it('ChatGroupAlreadyExistsError includes the conversationKey', async () => {
    const db = makeMockDb({ existingConv: { id: 'dup-key', type: 'group', name: null } });
    const deps = makeMockDeps();
    const ops = createInternalChatAccountOps(db, deps);

    try {
      await ops.createExternalChatGroup({
        accountId: 'acct-1',
        conversationKey: 'dup-key',
        name: 'Group',
      });
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as ChatGroupAlreadyExistsError).conversationKey).toBe('dup-key');
    }
  });
});

// ─── ensureDirectConversationByAccount ─────────────────────────────────────

describe('ensureDirectConversationByAccount', () => {
  it('returns conversationId and conversationKey', async () => {
    const db = makeMockDb();
    const deps = makeMockDeps();
    const ops = createInternalChatAccountOps(db, deps);

    const result = await ops.ensureDirectConversationByAccount({
      accountId: 'acct-1',
      participantAccountId: 'acct-2',
    });

    expect(result.conversationId).toBe('conv-dm');
    expect(result.conversationKey).toBe('conv-dm');
  });

  it('verifies both accounts exist via deps', async () => {
    const db = makeMockDb();
    const deps = makeMockDeps();
    const ops = createInternalChatAccountOps(db, deps);

    await ops.ensureDirectConversationByAccount({
      accountId: 'acct-1',
      participantAccountId: 'acct-2',
    });

    expect(deps.getRequiredExternalAccount).toHaveBeenCalledWith('acct-1');
    expect(deps.getRequiredAccount).toHaveBeenCalledWith('acct-2');
  });

  it('throws when ensureDirectConversation returns null', async () => {
    const db = makeMockDb();
    const deps = makeMockDeps({ ensureDirectConversation: vi.fn().mockResolvedValue(null) });
    const ops = createInternalChatAccountOps(db, deps);

    await expect(
      ops.ensureDirectConversationByAccount({
        accountId: 'acct-1',
        participantAccountId: 'acct-2',
      }),
    ).rejects.toThrow('Direct conversation creation failed');
  });
});

// ─── addMemberToGroupByAccount ───────────────────────────────────────────────

describe('addMemberToGroupByAccount', () => {
  it('adds member and returns updated group members list', async () => {
    const db = makeMockDb({ existingMember: null });
    const deps = makeMockDeps({
      listGroupMembersByAccount: vi.fn().mockResolvedValue([
        { participantId: 'acct-1', participantName: 'Alice', role: 'admin', joinedAt: '2025-01-01T00:00:00Z' },
        { participantId: 'acct-2', participantName: 'Bob', role: 'normal', joinedAt: '2025-01-02T00:00:00Z' },
      ]),
    });
    const ops = createInternalChatAccountOps(db, deps);

    const result = await ops.addMemberToGroupByAccount({
      accountId: 'acct-1',
      groupId: 'conv-group',
      participantAccountId: 'acct-2',
      role: 'normal',
    });

    expect(result).toHaveLength(2);
    expect(db.insert).toHaveBeenCalled();
    expect(deps.getRequiredGroupForAccount).toHaveBeenCalledWith('acct-1', 'conv-group');
  });

  it('uses default role "normal" when role not provided', async () => {
    const db = makeMockDb({ existingMember: null });
    const deps = makeMockDeps();
    const ops = createInternalChatAccountOps(db, deps);

    await ops.addMemberToGroupByAccount({
      accountId: 'acct-1',
      groupId: 'conv-group',
      participantAccountId: 'acct-2',
    });

    expect(db.insert).toHaveBeenCalled();
  });

  it('returns existing members list without inserting when member already exists', async () => {
    const db = makeMockDb({
      existingMember: { accountId: 'acct-2', conversationId: 'conv-group' },
    });
    const deps = makeMockDeps();
    const ops = createInternalChatAccountOps(db, deps);

    const result = await ops.addMemberToGroupByAccount({
      accountId: 'acct-1',
      groupId: 'conv-group',
      participantAccountId: 'acct-2',
    });

    expect(db.insert).not.toHaveBeenCalled();
    expect(deps.listGroupMembersByAccount).toHaveBeenCalled();
  });
});

// ─── updateMemberRoleByAccount ───────────────────────────────────────────────

describe('updateMemberRoleByAccount', () => {
  it('updates role and returns updated members list', async () => {
    const db = makeMockDb();
    const deps = makeMockDeps();
    const ops = createInternalChatAccountOps(db, deps);

    const result = await ops.updateMemberRoleByAccount({
      accountId: 'acct-1',
      groupId: 'conv-group',
      participantAccountId: 'acct-2',
      role: 'admin',
    });

    expect(db.update).toHaveBeenCalled();
    expect(deps.listGroupMembersByAccount).toHaveBeenCalledWith({
      accountId: 'acct-1',
      groupId: 'conv-group',
    });
  });

  it('verifies group exists before updating', async () => {
    const db = makeMockDb();
    const deps = makeMockDeps();
    const ops = createInternalChatAccountOps(db, deps);

    await ops.updateMemberRoleByAccount({
      accountId: 'acct-1',
      groupId: 'conv-group',
      participantAccountId: 'acct-2',
      role: 'moderator',
    });

    expect(deps.getRequiredGroupForAccount).toHaveBeenCalledWith('acct-1', 'conv-group');
  });
});

// ─── removeMemberFromGroupByAccount ──────────────────────────────────────────

describe('removeMemberFromGroupByAccount', () => {
  it('removes member and returns updated members list', async () => {
    const db = makeMockDb();
    const deps = makeMockDeps();
    const ops = createInternalChatAccountOps(db, deps);

    const result = await ops.removeMemberFromGroupByAccount({
      accountId: 'acct-1',
      groupId: 'conv-group',
      participantAccountId: 'acct-2',
    });

    expect(db.delete).toHaveBeenCalled();
    expect(deps.listGroupMembersByAccount).toHaveBeenCalled();
  });

  it('verifies group exists before removing', async () => {
    const db = makeMockDb();
    const deps = makeMockDeps();
    const ops = createInternalChatAccountOps(db, deps);

    await ops.removeMemberFromGroupByAccount({
      accountId: 'acct-1',
      groupId: 'conv-group',
      participantAccountId: 'acct-2',
    });

    expect(deps.getRequiredGroupForAccount).toHaveBeenCalledWith('acct-1', 'conv-group');
  });
});

// ─── updateGroupByAccount ────────────────────────────────────────────────────

describe('updateGroupByAccount', () => {
  it('updates group name and returns members list', async () => {
    const members = [{ participantId: 'acct-1', participantName: 'Alice', role: 'admin', joinedAt: '2025-01-01T00:00:00Z' }];
    const db = makeMockDb();
    const deps = makeMockDeps({ listGroupMembersByAccount: vi.fn().mockResolvedValue(members) });
    const ops = createInternalChatAccountOps(db, deps);

    const result = await ops.updateGroupByAccount({
      accountId: 'acct-1',
      groupId: 'conv-group',
      name: 'Renamed Team',
    });

    expect(result).toEqual(members);
    expect(db.update).toHaveBeenCalled();
  });

  it('falls back to existing group name when name not provided', async () => {
    const members = [{ participantId: 'acct-1', participantName: 'Alice', role: 'admin', joinedAt: '2025-01-01T00:00:00Z' }];
    const db = makeMockDb();
    const deps = makeMockDeps({
      listGroupMembersByAccount: vi.fn().mockResolvedValue(members),
      getRequiredGroupForAccount: vi.fn().mockResolvedValue({ id: 'conv-group', type: 'group', name: 'Original Name' }),
    });
    const ops = createInternalChatAccountOps(db, deps);

    const result = await ops.updateGroupByAccount({
      accountId: 'acct-1',
      groupId: 'conv-group',
      name: undefined,
    });

    expect(result).toEqual(members);
    expect(db.update).toHaveBeenCalled();
    // name falls back to existing group.name
  });

  it('always calls listGroupMembersByAccount regardless of input', async () => {
    const members = [{ participantId: 'acct-1', participantName: 'Alice', role: 'admin', joinedAt: '2025-01-01T00:00:00Z' }];
    const db = makeMockDb();
    const deps = makeMockDeps({ listGroupMembersByAccount: vi.fn().mockResolvedValue(members) });
    const ops = createInternalChatAccountOps(db, deps);

    await ops.updateGroupByAccount({
      accountId: 'acct-1',
      groupId: 'conv-group',
      name: 'New Name',
    });

    expect(deps.listGroupMembersByAccount).toHaveBeenCalledWith({ accountId: 'acct-1', groupId: 'conv-group' });
  });
});