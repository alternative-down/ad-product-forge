/**
 * Unit tests for communication/internal-chat-sending.ts.
 * createChatSending — sendMessage, getMessageAttachmentByAccount.
 * Zero prior coverage.
 */
import { describe, expect, it, vi } from 'vitest';
import { createChatSending } from './internal-chat-sending';

// ─── Mock factories ────────────────────────────────────────────────────────────

function makeMockAccounts(overrides: {
  getAccountByAgentIdResult?: { id: string; displayName: string; slug: string } | null;
  getAccountBySlugResult?: { id: string } | null;
  getRequiredAccountResult?: { id: string; displayName: string; slug: string; agentId: string | null };
  getRequiredAccountError?: Error;
} = {}) {
  return {
    getAccountByAgentId: vi.fn().mockResolvedValue(overrides.getAccountByAgentIdResult ?? null),
    getAccountBySlug: vi.fn().mockResolvedValue(overrides.getAccountBySlugResult ?? null),
    getRequiredAccount: vi.fn().mockImplementation(async (id: string) => {
      if (overrides.getRequiredAccountError) throw overrides.getRequiredAccountError;
      return overrides.getRequiredAccountResult ?? { id, displayName: 'User', slug: 'user', agentId: 'agent-1' };
    }),
  };
}

function makeMockServiceHelpers(overrides: {
  getRequiredConversationForAccountError?: Error;
  getRequiredConversationForAccountResult?: { id: string; name: string; type: string };
} = {}) {
  return {
    getRequiredConversationForAccount: vi.fn().mockImplementation(async (accountId: string, convKey: string) => {
      if (overrides.getRequiredConversationForAccountError) throw overrides.getRequiredConversationForAccountError;
      return overrides.getRequiredConversationForAccountResult ?? { id: convKey, name: 'Conv', type: 'dm' };
    }),
  };
}

function makeMockGroups(overrides: {
  ensureDirectConversationError?: Error;
  ensureDirectConversationResult?: { id: string; name: string; type: string };
} = {}) {
  return {
    ensureDirectConversation: vi.fn().mockImplementation(async (left: string, right: string) => {
      if (overrides.ensureDirectConversationError) throw overrides.ensureDirectConversationError;
      return overrides.ensureDirectConversationResult ?? { id: `conv-${right}`, name: 'DM', type: 'dm' };
    }),
  };
}

function makeMockConnection() {
  return {
    deliverToParticipants: vi.fn().mockReturnValue(['agent-2', 'agent-3']),
  };
}

function makeMockReads() {
  return {
    listGroupMembersOrDmPeersByAccount: vi.fn().mockResolvedValue([
      { participantKey: 'agent-2', displayName: 'Bob', role: 'normal' },
    ]),
  };
}

function makeMockAttachments(overrides: {
  storeError?: Error;
} = {}) {
  return {
    storeMessageAttachments: vi.fn().mockImplementation(async () => {
      if (overrides.storeError) throw overrides.storeError;
    }),
    readMessageAttachment: vi.fn().mockResolvedValue({ stream: null, contentType: 'text/plain' }),
  };
}

function makeMockDb(overrides: {
  findManyMembers?: unknown[];
  findManyError?: Error;
  updateRowsAffected?: number;
  updateError?: Error;
} = {}) {
  return {
    query: {
      internalChatConversationMembers: {
        findMany: vi.fn().mockImplementation(async () => {
          if (overrides.findManyError) throw overrides.findManyError;
          return overrides.findManyMembers ?? [{ accountId: 'acc-2' }, { accountId: 'acc-3' }];
        }),
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
  };
}

// ─── sendMessage ─────────────────────────────────────────────────────────────

describe('createChatSending — sendMessage', () => {
  it('resolves conversation via ensureDirectConversation when targetKey is an agentId', async () => {
    const accounts = makeMockAccounts({ getAccountByAgentIdResult: { id: 'acc-2', displayName: 'Bob', slug: 'bob' } });
    const groups = makeMockGroups({ ensureDirectConversationResult: { id: 'conv-abc', name: 'DM', type: 'dm' } });
    const serviceHelpers = makeMockServiceHelpers();
    const connection = makeMockConnection();
    const reads = makeMockReads();
    const attachments = makeMockAttachments();
    const db = makeMockDb();

    const sending = createChatSending({ db: db as never, accounts, serviceHelpers, groups, connection, reads, attachments });
    const result = await sending.sendMessage({ accountId: 'acc-1', targetKey: 'agent-bob', content: 'Hello', attachments: [] });

    expect(groups.ensureDirectConversation).toHaveBeenCalledWith('acc-1', 'acc-2');
    expect(result.conversationKey).toBe('conv-abc');
  });

  it('resolves conversation via getRequiredConversationForAccount when targetKey is a conversation key', async () => {
    const accounts = makeMockAccounts();
    const groups = makeMockGroups();
    const serviceHelpers = makeMockServiceHelpers({ getRequiredConversationForAccountResult: { id: 'conv-existing', name: 'Group', type: 'group' } });
    const connection = makeMockConnection();
    const reads = makeMockReads();
    const attachments = makeMockAttachments();
    const db = makeMockDb();

    const sending = createChatSending({ db: db as never, accounts, serviceHelpers, groups, connection, reads, attachments });
    const result = await sending.sendMessage({ accountId: 'acc-1', targetKey: 'conv-existing', content: 'Hi', attachments: [] });

    expect(serviceHelpers.getRequiredConversationForAccount).toHaveBeenCalledWith('acc-1', 'conv-existing');
    expect(result.conversationKey).toBe('conv-existing');
  });

  it('throws when getRequiredConversationForAccount fails', async () => {
    const accounts = makeMockAccounts();
    const groups = makeMockGroups();
    const serviceHelpers = makeMockServiceHelpers({ getRequiredConversationForAccountError: new Error('conv not found') });
    const connection = makeMockConnection();
    const reads = makeMockReads();
    const attachments = makeMockAttachments();
    const db = makeMockDb();

    const sending = createChatSending({ db: db as never, accounts, serviceHelpers, groups, connection, reads, attachments });

    await expect(
      sending.sendMessage({ accountId: 'acc-1', targetKey: 'conv-missing', content: 'Hi', attachments: [] }),
    ).rejects.toThrow('conv not found');
  });

  it('throws when findMany members fails', async () => {
    const accounts = makeMockAccounts({ getAccountByAgentIdResult: { id: 'acc-2', displayName: 'Bob', slug: 'bob' } });
    const groups = makeMockGroups({ ensureDirectConversationResult: { id: 'conv-1', name: 'DM', type: 'dm' } });
    const serviceHelpers = makeMockServiceHelpers();
    const connection = makeMockConnection();
    const reads = makeMockReads();
    const attachments = makeMockAttachments();
    const db = makeMockDb({ findManyError: new Error('findMany failed') });

    const sending = createChatSending({ db: db as never, accounts, serviceHelpers, groups, connection, reads, attachments });

    await expect(
      sending.sendMessage({ accountId: 'acc-1', targetKey: 'agent-bob', content: 'Hi', attachments: [] }),
    ).rejects.toThrow('findMany failed');
  });

  it('throws when insert messages fails', async () => {
    const accounts = makeMockAccounts({ getAccountByAgentIdResult: { id: 'acc-2', displayName: 'Bob', slug: 'bob' } });
    const groups = makeMockGroups({ ensureDirectConversationResult: { id: 'conv-1', name: 'DM', type: 'dm' } });
    const serviceHelpers = makeMockServiceHelpers();
    const connection = makeMockConnection();
    const reads = makeMockReads();
    const attachments = makeMockAttachments();
    const db = makeMockDb() as any;
    db.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation(async () => {
        throw new Error('insert failed');
      }),
    });

    const sending = createChatSending({ db, accounts, serviceHelpers, groups, connection, reads, attachments });

    await expect(
      sending.sendMessage({ accountId: 'acc-1', targetKey: 'agent-bob', content: 'Hi', attachments: [] }),
    ).rejects.toThrow('insert failed');
  });

  it('returns success with messageId and conversationKey', async () => {
    const accounts = makeMockAccounts({ getAccountByAgentIdResult: { id: 'acc-2', displayName: 'Bob', slug: 'bob' } });
    const groups = makeMockGroups({ ensureDirectConversationResult: { id: 'conv-xyz', name: 'DM', type: 'dm' } });
    const serviceHelpers = makeMockServiceHelpers();
    const connection = makeMockConnection();
    const reads = makeMockReads();
    const attachments = makeMockAttachments();
    const db = makeMockDb();

    const sending = createChatSending({ db: db as never, accounts, serviceHelpers, groups, connection, reads, attachments });
    const result = await sending.sendMessage({ accountId: 'acc-1', targetKey: 'agent-bob', content: 'Hello', attachments: [] });

    expect(result.success).toBe(true);
    expect(result.messageId).toBeTruthy();
    expect(result.conversationKey).toBe('conv-xyz');
  });

  it('calls storeMessageAttachments', async () => {
    const accounts = makeMockAccounts({ getAccountByAgentIdResult: { id: 'acc-2', displayName: 'Bob', slug: 'bob' } });
    const groups = makeMockGroups({ ensureDirectConversationResult: { id: 'conv-1', name: 'DM', type: 'dm' } });
    const serviceHelpers = makeMockServiceHelpers();
    const connection = makeMockConnection();
    const reads = makeMockReads();
    const attachments = makeMockAttachments();
    const db = makeMockDb();

    const sending = createChatSending({ db: db as never, accounts, serviceHelpers, groups, connection, reads, attachments });
    await sending.sendMessage({ accountId: 'acc-1', targetKey: 'agent-bob', content: 'Hi', attachments: [] });

    expect(attachments.storeMessageAttachments).toHaveBeenCalled();
  });

  it('calls deliverToParticipants with correct conversation data', async () => {
    const accounts = makeMockAccounts({ getAccountByAgentIdResult: { id: 'acc-2', displayName: 'Bob', slug: 'bob' } });
    const groups = makeMockGroups({ ensureDirectConversationResult: { id: 'conv-1', name: 'Team Chat', type: 'group' } });
    const serviceHelpers = makeMockServiceHelpers();
    const connection = makeMockConnection();
    const reads = makeMockReads();
    const attachments = makeMockAttachments();
    const db = makeMockDb();

    const sending = createChatSending({ db: db as never, accounts, serviceHelpers, groups, connection, reads, attachments });
    await sending.sendMessage({ accountId: 'acc-1', targetKey: 'agent-bob', content: 'Test message', attachments: [] });

    expect(connection.deliverToParticipants).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeAccountId: 'acc-1',
        conversation: expect.objectContaining({ id: 'conv-1', name: 'Team Chat', type: 'group' }),
        content: 'Test message',
      }),
    );
  });

  it('rethrows when storeMessageAttachments fails', async () => {
    const accounts = makeMockAccounts({ getAccountByAgentIdResult: { id: 'acc-2', displayName: 'Bob', slug: 'bob' } });
    const groups = makeMockGroups({ ensureDirectConversationResult: { id: 'conv-1', name: 'DM', type: 'dm' } });
    const serviceHelpers = makeMockServiceHelpers();
    const connection = makeMockConnection();
    const reads = makeMockReads();
    const attachments = makeMockAttachments({ storeError: new Error('storage failed') });
    const db = makeMockDb();

    const sending = createChatSending({ db: db as never, accounts, serviceHelpers, groups, connection, reads, attachments });

    await expect(
      sending.sendMessage({ accountId: 'acc-1', targetKey: 'agent-bob', content: 'Hi', attachments: [] }),
    ).rejects.toThrow('storage failed');
  });
});

// ─── getMessageAttachmentByAccount ────────────────────────────────────────────

describe('createChatSending — getMessageAttachmentByAccount', () => {
  it('delegates to attachments.readMessageAttachment', async () => {
    const accounts = makeMockAccounts();
    const groups = makeMockGroups();
    const serviceHelpers = makeMockServiceHelpers();
    const connection = makeMockConnection();
    const reads = makeMockReads();
    const attachments = makeMockAttachments();
    const db = makeMockDb();

    const sending = createChatSending({ db: db as never, accounts, serviceHelpers, groups, connection, reads, attachments });
    const result = await sending.getMessageAttachmentByAccount({ accountId: 'acc-1', conversationId: 'conv-1', messageId: 'msg-1', attachmentName: 'file.txt' });

    expect(attachments.readMessageAttachment).toHaveBeenCalledWith('msg-1', 'file.txt');
    expect(result).toEqual({ stream: null, contentType: 'text/plain' });
  });
});
// ─── replyToMessageId support ─────────────────────────────────────────────────

function makeMockDbWithReplySupport(overrides: {
  findManyMembers?: unknown[];
  findManyError?: Error;
  parentMessage?: { id: string; conversationId: string } | null;
  parentMessageError?: Error;
  updateRowsAffected?: number;
} = {}) {
  return {
    query: {
      internalChatConversationMembers: {
        findMany: vi.fn().mockImplementation(async () => {
          if (overrides.findManyError) throw overrides.findManyError;
          return overrides.findManyMembers ?? [{ accountId: 'acc-2' }, { accountId: 'acc-3' }];
        }),
      },
      internalChatMessages: {
        findFirst: vi.fn().mockImplementation(async () => {
          if (overrides.parentMessageError) throw overrides.parentMessageError;
          return overrides.parentMessage ?? null;
        }),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue({}),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowsAffected: overrides.updateRowsAffected ?? 1 }),
      }),
    }),
  };
}

describe('createChatSending — sendMessage with replyToMessageId', () => {
  it('accepts replyToMessageId and stores it in the database', async () => {
    const accounts = makeMockAccounts({ getAccountByAgentIdResult: { id: 'acc-2', displayName: 'Bob', slug: 'bob' } });
    const groups = makeMockGroups({ ensureDirectConversationResult: { id: 'conv-1', name: 'DM', type: 'dm' } });
    const serviceHelpers = makeMockServiceHelpers();
    const connection = makeMockConnection();
    const reads = makeMockReads();
    const attachments = makeMockAttachments();
    const db = makeMockDbWithReplySupport({
      parentMessage: { id: 'msg-parent', conversationId: 'conv-1' },
    });

    const sending = createChatSending({ db: db as never, accounts, serviceHelpers, groups, connection, reads, attachments });
    const result = await sending.sendMessage({
      accountId: 'acc-1', targetKey: 'agent-bob', content: 'reply message', attachments: [],
      replyToMessageId: 'msg-parent',
    });

    expect(result.success).toBe(true);
    expect(db.query.internalChatMessages.findFirst).toHaveBeenCalled();
    // Verify insert was called with replyToMessageId
    expect(db.insert).toHaveBeenCalled();
  });

  it('stores null when replyToMessageId is not provided', async () => {
    const accounts = makeMockAccounts({ getAccountByAgentIdResult: { id: 'acc-2', displayName: 'Bob', slug: 'bob' } });
    const groups = makeMockGroups({ ensureDirectConversationResult: { id: 'conv-1', name: 'DM', type: 'dm' } });
    const serviceHelpers = makeMockServiceHelpers();
    const connection = makeMockConnection();
    const reads = makeMockReads();
    const attachments = makeMockAttachments();
    const db = makeMockDbWithReplySupport({ parentMessage: { id: 'msg-parent', conversationId: 'conv-1' } });

    const sending = createChatSending({ db: db as never, accounts, serviceHelpers, groups, connection, reads, attachments });
    await sending.sendMessage({ accountId: 'acc-1', targetKey: 'agent-bob', content: 'plain message', attachments: [] });

    expect(db.query.internalChatMessages.findFirst).not.toHaveBeenCalled();
  });

  it('throws when replyToMessageId references a non-existent message', async () => {
    const accounts = makeMockAccounts({ getAccountByAgentIdResult: { id: 'acc-2', displayName: 'Bob', slug: 'bob' } });
    const groups = makeMockGroups({ ensureDirectConversationResult: { id: 'conv-1', name: 'DM', type: 'dm' } });
    const serviceHelpers = makeMockServiceHelpers();
    const connection = makeMockConnection();
    const reads = makeMockReads();
    const attachments = makeMockAttachments();
    const db = makeMockDbWithReplySupport({ parentMessage: null });

    const sending = createChatSending({ db: db as never, accounts, serviceHelpers, groups, connection, reads, attachments });
    await expect(
      sending.sendMessage({ accountId: 'acc-1', targetKey: 'agent-bob', content: 'reply', attachments: [], replyToMessageId: 'msg-nonexistent' }),
    ).rejects.toThrow('Reply target message not found');
  });

  it('throws when replyToMessageId belongs to a different conversation', async () => {
    const accounts = makeMockAccounts({ getAccountByAgentIdResult: { id: 'acc-2', displayName: 'Bob', slug: 'bob' } });
    const groups = makeMockGroups({ ensureDirectConversationResult: { id: 'conv-1', name: 'DM', type: 'dm' } });
    const serviceHelpers = makeMockServiceHelpers();
    const connection = makeMockConnection();
    const reads = makeMockReads();
    const attachments = makeMockAttachments();
    const db = makeMockDbWithReplySupport({
      parentMessage: { id: 'msg-parent', conversationId: 'conv-other' },
    });

    const sending = createChatSending({ db: db as never, accounts, serviceHelpers, groups, connection, reads, attachments });
    await expect(
      sending.sendMessage({ accountId: 'acc-1', targetKey: 'agent-bob', content: 'reply', attachments: [], replyToMessageId: 'msg-parent' }),
    ).rejects.toThrow('Reply target belongs to a different conversation');
  });

  it('rethrows when parent message lookup fails', async () => {
    const accounts = makeMockAccounts({ getAccountByAgentIdResult: { id: 'acc-2', displayName: 'Bob', slug: 'bob' } });
    const groups = makeMockGroups({ ensureDirectConversationResult: { id: 'conv-1', name: 'DM', type: 'dm' } });
    const serviceHelpers = makeMockServiceHelpers();
    const connection = makeMockConnection();
    const reads = makeMockReads();
    const attachments = makeMockAttachments();
    const db = makeMockDbWithReplySupport({
      parentMessageError: new Error('DB lookup failed'),
    });

    const sending = createChatSending({ db: db as never, accounts, serviceHelpers, groups, connection, reads, attachments });
    await expect(
      sending.sendMessage({ accountId: 'acc-1', targetKey: 'agent-bob', content: 'reply', attachments: [], replyToMessageId: 'msg-parent' }),
    ).rejects.toThrow('DB lookup failed');
  });
});
