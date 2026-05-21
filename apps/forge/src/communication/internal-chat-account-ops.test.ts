/**
 * Unit tests for communication/internal-chat-account-ops.ts.
 * createInternalChatAccountOps — createExternalChatGroup, ensureDirectConversationByAccount,
 * addMemberToGroupByAccount, updateMemberRoleByAccount, removeMemberFromGroupByAccount,
 * updateGroupByAccount.
 * Zero prior coverage.
 */
import { describe, expect, it, vi } from 'vitest';
import { createInternalChatAccountOps } from './internal-chat-account-ops';

// ─── Mock deps factory ────────────────────────────────────────────────────────

function makeMockDeps(
  overrides: {
    getRequiredAccountError?: Error;
    getRequiredExternalAccountError?: Error;
    ensureDirectConversationResult?: {
      id: string;
      type: string;
      name: string | null;
      createdByAccountId: string;
      createdAt: number;
      updatedAt: number;
    } | null;
    ensureDirectConversationError?: Error;
    listGroupMembersByAccountResult?: Array<{
      participantId: string;
      participantName: string;
      role: string;
      joinedAt: string;
    }>;
    listGroupMembersByAccountError?: Error;
    getRequiredGroupForAccountError?: Error;
    getRequiredGroupForAccountResult?: { id: string; type: string; name: string | null };
  } = {},
) {
  return {
    getRequiredAccount: vi.fn().mockImplementation(async (id: string) => {
      if (overrides.getRequiredAccountError) throw overrides.getRequiredAccountError;
      return { id, agentId: 'agent-1', slug: 'user', displayName: 'User' };
    }),
    getRequiredExternalAccount: vi.fn().mockImplementation(async (id: string) => {
      if (overrides.getRequiredExternalAccountError)
        throw overrides.getRequiredExternalAccountError;
      return { id, agentId: 'agent-1', slug: 'user', displayName: 'User' };
    }),
    ensureDirectConversation: vi.fn().mockImplementation(async (left: string, right: string) => {
      if (overrides.ensureDirectConversationError) throw overrides.ensureDirectConversationError;
      return (
        overrides.ensureDirectConversationResult ?? {
          id: `conv-${right}`,
          type: 'dm',
          name: null,
          createdByAccountId: left,
          createdAt: 1,
          updatedAt: 1,
        }
      );
    }),
    listGroupMembersByAccount: vi
      .fn()
      .mockImplementation(async (input: { accountId: string; groupId: string }) => {
        if (overrides.listGroupMembersByAccountError)
          throw overrides.listGroupMembersByAccountError;
        return overrides.listGroupMembersByAccountResult ?? [];
      }),
    getRequiredGroupForAccount: vi
      .fn()
      .mockImplementation(async (accountId: string, groupId: string) => {
        if (overrides.getRequiredGroupForAccountError)
          throw overrides.getRequiredGroupForAccountError;
        return (
          overrides.getRequiredGroupForAccountResult ?? { id: groupId, type: 'group', name: null }
        );
      }),
  };
}

// ─── Mock DB factory ──────────────────────────────────────────────────────────

function makeMockDb(
  overrides: {
    findFirstResult?: unknown;
    findFirstError?: Error;
    updateRowsAffected?: number;
    updateError?: Error;
    deleteRowsAffected?: number;
    deleteError?: Error;
  } = {},
) {
  return {
    query: {
      internalChatConversations: {
        findFirst: vi.fn().mockImplementation(async () => {
          if (overrides.findFirstError) throw overrides.findFirstError;
          return overrides.findFirstResult ?? null;
        }),
      },
      internalChatConversationMembers: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue({}),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(async () => {
          if (overrides.updateError) throw overrides.updateError;
          return { rowsAffected: overrides.updateRowsAffected ?? 1 };
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(async () => {
        if (overrides.deleteError) throw overrides.deleteError;
        return { rowsAffected: overrides.deleteRowsAffected ?? 1 };
      }),
    }),
  };
}

// ─── createExternalChatGroup ─────────────────────────────────────────────────

describe('createInternalChatAccountOps — createExternalChatGroup', () => {
  it('creates a new group when conversationKey does not exist', async () => {
    const db = makeMockDb({ findFirstResult: null });
    const deps = makeMockDeps();
    const ops = createInternalChatAccountOps(db as never, deps);

    const result = await ops.createExternalChatGroup({
      accountId: 'acc-1',
      conversationKey: 'group-new',
      name: 'Test Group',
    });

    expect(result.groupId).toBe('group-new');
    expect(result.name).toBe('Test Group');
    expect(result.provider).toBe('internal-chat');
    expect(result.conversationKey).toBe('group-new');
    expect(result.creatorMember.participantName).toBe('User');
    expect(result.creatorMember.role).toBe('admin');
  });

  it('inserts conversation and member records', async () => {
    const db = makeMockDb({ findFirstResult: null });
    const deps = makeMockDeps();
    const ops = createInternalChatAccountOps(db as never, deps);

    await ops.createExternalChatGroup({
      accountId: 'acc-1',
      conversationKey: 'group-new',
      name: 'Test Group',
    });

    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it('throws ChatGroupAlreadyExistsError when conversationKey exists', async () => {
    const db = makeMockDb({ findFirstResult: { id: 'group-existing' } });
    const deps = makeMockDeps();
    const ops = createInternalChatAccountOps(db as never, deps);

    await expect(
      ops.createExternalChatGroup({
        accountId: 'acc-1',
        conversationKey: 'group-existing',
        name: 'Test',
      }),
    ).rejects.toThrow('already exists');
  });
});

// ─── ensureDirectConversationByAccount ─────────────────────────────────────

describe('createInternalChatAccountOps — ensureDirectConversationByAccount', () => {
  it('delegates to deps.ensureDirectConversation', async () => {
    const db = makeMockDb();
    const deps = makeMockDeps({
      ensureDirectConversationResult: {
        id: 'conv-2',
        type: 'dm',
        name: null,
        createdByAccountId: 'acc-1',
        createdAt: 1,
        updatedAt: 1,
      },
    });
    const ops = createInternalChatAccountOps(db as never, deps);

    const result = await ops.ensureDirectConversationByAccount({
      accountId: 'acc-1',
      participantAccountId: 'acc-2',
    });

    expect(deps.ensureDirectConversation).toHaveBeenCalledWith('acc-1', 'acc-2');
    expect(result.conversationId).toBe('conv-2');
    expect(result.conversationKey).toBe('conv-2');
  });
});

// ─── addMemberToGroupByAccount ───────────────────────────────────────────────

describe('createInternalChatAccountOps — addMemberToGroupByAccount', () => {
  it('inserts a new member after validating group and participant', async () => {
    const db = makeMockDb();
    const deps = makeMockDeps();
    const ops = createInternalChatAccountOps(db as never, deps);

    await ops.addMemberToGroupByAccount({
      accountId: 'acc-1',
      groupId: 'group-1',
      participantAccountId: 'acc-2',
    });

    expect(deps.getRequiredGroupForAccount).toHaveBeenCalledWith('acc-1', 'group-1');
    expect(deps.getRequiredAccount).toHaveBeenCalledWith('acc-2');
    expect(db.insert).toHaveBeenCalled();
  });

  it('throws when getRequiredGroupForAccount fails', async () => {
    const db = makeMockDb();
    const deps = makeMockDeps({ getRequiredGroupForAccountError: new Error('not a group') });
    const ops = createInternalChatAccountOps(db as never, deps);

    await expect(
      ops.addMemberToGroupByAccount({
        accountId: 'acc-1',
        groupId: 'group-1',
        participantAccountId: 'acc-2',
      }),
    ).rejects.toThrow('not a group');
  });
});

// ─── updateMemberRoleByAccount ────────────────────────────────────────────────

describe('createInternalChatAccountOps — updateMemberRoleByAccount', () => {
  it('updates the member role', async () => {
    const db = makeMockDb({ updateRowsAffected: 1 });
    const deps = makeMockDeps();
    const ops = createInternalChatAccountOps(db as never, deps);

    await ops.updateMemberRoleByAccount({
      accountId: 'acc-1',
      groupId: 'group-1',
      participantAccountId: 'member-1',
      role: 'admin',
    });

    expect(db.update).toHaveBeenCalled();
    expect(deps.getRequiredGroupForAccount).toHaveBeenCalledWith('acc-1', 'group-1');
  });

  it('throws when getRequiredGroupForAccount fails', async () => {
    const db = makeMockDb();
    const deps = makeMockDeps({ getRequiredGroupForAccountError: new Error('not found') });
    const ops = createInternalChatAccountOps(db as never, deps);

    await expect(
      ops.updateMemberRoleByAccount({
        accountId: 'acc-1',
        groupId: 'group-1',
        participantAccountId: 'member-1',
        role: 'admin',
      }),
    ).rejects.toThrow('not found');
  });
});

// ─── removeMemberFromGroupByAccount ───────────────────────────────────────────

describe('createInternalChatAccountOps — removeMemberFromGroupByAccount', () => {
  it('deletes the member from the group', async () => {
    const db = makeMockDb({ deleteRowsAffected: 1 });
    const deps = makeMockDeps();
    const ops = createInternalChatAccountOps(db as never, deps);

    await ops.removeMemberFromGroupByAccount({
      accountId: 'acc-1',
      groupId: 'group-1',
      participantAccountId: 'member-1',
    });

    expect(deps.getRequiredGroupForAccount).toHaveBeenCalledWith('acc-1', 'group-1');
    expect(db.delete).toHaveBeenCalled();
  });
});

// ─── updateGroupByAccount ────────────────────────────────────────────────────

describe('createInternalChatAccountOps — updateGroupByAccount', () => {
  it('updates the group name via db.update', async () => {
    const db = makeMockDb({ updateRowsAffected: 1 });
    const deps = makeMockDeps();
    const ops = createInternalChatAccountOps(db as never, deps);

    await ops.updateGroupByAccount({
      accountId: 'acc-1',
      groupId: 'group-1',
      name: 'Updated Name',
    });

    expect(deps.getRequiredGroupForAccount).toHaveBeenCalledWith('acc-1', 'group-1');
    expect(db.update).toHaveBeenCalled();
  });

  it('throws when getRequiredGroupForAccount fails', async () => {
    const db = makeMockDb();
    const deps = makeMockDeps({ getRequiredGroupForAccountError: new Error('not found') });
    const ops = createInternalChatAccountOps(db as never, deps);

    await expect(
      ops.updateGroupByAccount({ accountId: 'acc-1', groupId: 'group-1', name: 'New Name' }),
    ).rejects.toThrow('not found');
  });
});
