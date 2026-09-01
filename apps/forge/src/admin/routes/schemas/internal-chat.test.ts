/**
 * Unit tests for admin/routes/schemas/internal-chat.ts.
 * Zod validation schemas for internal-chat admin routes.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import {
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
} from './internal-chat';

// ─── adminInternalChatSendSchema ─────────────────────────────────────────────

describe('adminInternalChatSendSchema', () => {
  it('parses minimal valid input', () => {
    const result = adminInternalChatSendSchema.parse({
      agentId: 'agent-1',
      targetKey: 'user@example.com',
      provider: 'internal-chat',
      content: 'Hello',
    });
    expect(result.agentId).toBe('agent-1');
    expect(result.content).toBe('Hello');
  });

  it('rejects missing agentId', () => {
    expect(() =>
      adminInternalChatSendSchema.parse({
        targetKey: 'u',
        provider: 'p',
        content: 'c',
      }),
    ).toThrow();
  });

  it('rejects empty agentId', () => {
    expect(() =>
      adminInternalChatSendSchema.parse({
        agentId: '',
        targetKey: 'u',
        provider: 'p',
        content: 'c',
      }),
    ).toThrow();
  });

  it('rejects missing content', () => {
    expect(() =>
      adminInternalChatSendSchema.parse({
        agentId: 'a',
        targetKey: 'u',
        provider: 'p',
      }),
    ).toThrow();
  });

  it('rejects missing targetKey', () => {
    expect(() =>
      adminInternalChatSendSchema.parse({
        agentId: 'a',
        provider: 'p',
        content: 'c',
      }),
    ).toThrow();
  });
});

// ─── createExternalInternalChatAccountSchema ────────────────────────────────

describe('createExternalInternalChatAccountSchema', () => {
  it('parses minimal valid input (provider + targetKey)', () => {
    const result = createExternalInternalChatAccountSchema.parse({
      provider: 'internal-chat',
      targetKey: 'user@example.com',
    });
    expect(result.provider).toBe('internal-chat');
    expect(result.targetKey).toBe('user@example.com');
  });

  it('parses with optional name', () => {
    const result = createExternalInternalChatAccountSchema.parse({
      provider: 'ic',
      targetKey: 'u',
      name: 'My Account',
    });
    expect(result.name).toBe('My Account');
  });

  it('rejects missing provider', () => {
    expect(() => createExternalInternalChatAccountSchema.parse({ targetKey: 'u' })).toThrow();
  });

  it('rejects empty provider', () => {
    expect(() =>
      createExternalInternalChatAccountSchema.parse({ provider: '', targetKey: 'u' }),
    ).toThrow();
  });
});

// ─── updateExternalInternalChatAccountSchema ────────────────────────────────

describe('updateExternalInternalChatAccountSchema', () => {
  it('parses minimal valid input (accountId only)', () => {
    const result = updateExternalInternalChatAccountSchema.parse({ accountId: 'acc-1' });
    expect(result.accountId).toBe('acc-1');
  });

  it('parses with optional name', () => {
    const result = updateExternalInternalChatAccountSchema.parse({
      accountId: 'a',
      name: 'New Name',
    });
    expect(result.name).toBe('New Name');
  });

  it('parses with valid webhookUrl', () => {
    const result = updateExternalInternalChatAccountSchema.parse({
      accountId: 'a',
      webhookUrl: 'https://example.com/webhook',
    });
    expect(result.webhookUrl).toBe('https://example.com/webhook');
  });

  it('accepts null webhookUrl', () => {
    const result = updateExternalInternalChatAccountSchema.parse({
      accountId: 'a',
      webhookUrl: null,
    });
    expect(result.webhookUrl).toBeNull();
  });

  it('rejects invalid webhookUrl format', () => {
    expect(() =>
      updateExternalInternalChatAccountSchema.parse({
        accountId: 'a',
        webhookUrl: 'not-a-url',
      }),
    ).toThrow();
  });

  it('rejects missing accountId', () => {
    expect(() => updateExternalInternalChatAccountSchema.parse({ name: 'n' })).toThrow();
  });
});

// ─── deleteExternalInternalChatAccountSchema ───────────────────────────────

describe('deleteExternalInternalChatAccountSchema', () => {
  it('parses with accountId', () => {
    expect(deleteExternalInternalChatAccountSchema.parse({ accountId: 'acc-1' })).toMatchObject({
      accountId: 'acc-1',
    });
  });

  it('rejects missing accountId', () => {
    expect(() => deleteExternalInternalChatAccountSchema.parse({})).toThrow();
  });

  it('rejects empty accountId', () => {
    expect(() => deleteExternalInternalChatAccountSchema.parse({ accountId: '' })).toThrow();
  });
});

// ─── internalChatAccountIdQuerySchema ─────────────────────────────────────

describe('internalChatAccountIdQuerySchema', () => {
  it('parses with accountId', () => {
    expect(internalChatAccountIdQuerySchema.parse({ accountId: 'acc-1' })).toMatchObject({
      accountId: 'acc-1',
    });
  });

  it('rejects missing accountId', () => {
    expect(() => internalChatAccountIdQuerySchema.parse({})).toThrow();
  });
});

// ─── internalChatMessagesQuerySchema ────────────────────────────────────────

describe('internalChatMessagesQuerySchema', () => {
  it('parses minimal valid input (required fields only)', () => {
    const result = internalChatMessagesQuerySchema.parse({
      accountId: 'acc-1',
      conversationId: 'conv-1',
    });
    expect(result.accountId).toBe('acc-1');
    expect(result.conversationId).toBe('conv-1');
    expect(result.limit).toBe(20); // default
    expect(result.offset).toBe(0); // default
  });

  it('parses with explicit limit and offset', () => {
    const result = internalChatMessagesQuerySchema.parse({
      accountId: 'a',
      conversationId: 'c',
      limit: 50,
      offset: 10,
    });
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(10);
  });

  it('coerces string limit to number', () => {
    const result = internalChatMessagesQuerySchema.parse({
      accountId: 'a',
      conversationId: 'c',
      limit: '25',
    });
    expect(result.limit).toBe(25);
  });

  it('coerces string offset to number', () => {
    const result = internalChatMessagesQuerySchema.parse({
      accountId: 'a',
      conversationId: 'c',
      offset: '5',
    });
    expect(result.offset).toBe(5);
  });

  it('rejects limit less than 1', () => {
    expect(() =>
      internalChatMessagesQuerySchema.parse({
        accountId: 'a',
        conversationId: 'c',
        limit: 0,
      }),
    ).toThrow();
  });

  it('rejects limit greater than 100', () => {
    expect(() =>
      internalChatMessagesQuerySchema.parse({
        accountId: 'a',
        conversationId: 'c',
        limit: 101,
      }),
    ).toThrow();
  });

  it('rejects negative offset', () => {
    expect(() =>
      internalChatMessagesQuerySchema.parse({
        accountId: 'a',
        conversationId: 'c',
        offset: -1,
      }),
    ).toThrow();
  });

  it('rejects missing conversationId', () => {
    expect(() => internalChatMessagesQuerySchema.parse({ accountId: 'a' })).toThrow();
  });
});

// ─── internalChatMessageAttachmentQuerySchema ──────────────────────────────

describe('internalChatMessageAttachmentQuerySchema', () => {
  it('parses valid input', () => {
    const result = internalChatMessageAttachmentQuerySchema.parse({
      accountId: 'acc-1',
      conversationId: 'conv-1',
      messageId: 'msg-1',
      attachmentName: 'document.pdf',
    });
    expect(result.attachmentName).toBe('document.pdf');
  });

  it('rejects missing attachmentName', () => {
    expect(() =>
      internalChatMessageAttachmentQuerySchema.parse({
        accountId: 'a',
        conversationId: 'c',
        messageId: 'm',
      }),
    ).toThrow();
  });

  it('rejects empty attachmentName', () => {
    expect(() =>
      internalChatMessageAttachmentQuerySchema.parse({
        accountId: 'a',
        conversationId: 'c',
        messageId: 'm',
        attachmentName: '',
      }),
    ).toThrow();
  });
});

// ─── createInternalChatConversationSchema ─────────────────────────────────

describe('createInternalChatConversationSchema', () => {
  it('parses minimal valid input', () => {
    const result = createInternalChatConversationSchema.parse({
      accountId: 'acc-1',
      memberKeys: ['user-1', 'user-2'],
    });
    expect(result.memberKeys).toEqual(['user-1', 'user-2']);
  });

  it('parses with optional name', () => {
    const result = createInternalChatConversationSchema.parse({
      accountId: 'a',
      name: 'Team Chat',
      memberKeys: ['u1'],
    });
    expect(result.name).toBe('Team Chat');
  });

  it('rejects empty memberKeys array', () => {
    expect(() =>
      createInternalChatConversationSchema.parse({
        accountId: 'a',
        memberKeys: [],
      }),
    ).toThrow();
  });

  it('rejects missing memberKeys', () => {
    expect(() => createInternalChatConversationSchema.parse({ accountId: 'a' })).toThrow();
  });
});

// ─── sendInternalChatConversationMessageSchema ─────────────────────────────

describe('sendInternalChatConversationMessageSchema', () => {
  it('parses minimal valid input', () => {
    const result = sendInternalChatConversationMessageSchema.parse({
      accountId: 'acc-1',
      conversationId: 'conv-1',
      content: 'Hello there',
    });
    expect(result.conversationId).toBe('conv-1');
    expect(result.content).toBe('Hello there');
  });

  it('parses with optional parentMessageId', () => {
    const result = sendInternalChatConversationMessageSchema.parse({
      accountId: 'acc-1',
      conversationId: 'c',
      content: 'msg',
      parentMessageId: 'parent-1',
    });
    expect(result.parentMessageId).toBe('parent-1');
  });

  it('rejects missing conversationId', () => {
    expect(() => sendInternalChatConversationMessageSchema.parse({ content: 'c' })).toThrow();
  });

  it('rejects empty content', () => {
    expect(() =>
      sendInternalChatConversationMessageSchema.parse({
        conversationId: 'c',
        content: '',
      }),
    ).toThrow();
  });
});

// ─── updateInternalChatConversationSchema ─────────────────────────────────

describe('updateInternalChatConversationSchema', () => {
  it('parses minimal valid input (conversationId only)', () => {
    const result = updateInternalChatConversationSchema.parse({ accountId: 'acc-1', conversationId: 'conv-1' });
    expect(result.conversationId).toBe('conv-1');
  });

  it('parses with optional name', () => {
    const result = updateInternalChatConversationSchema.parse({
      accountId: 'acc-1',
      conversationId: 'c',
      name: 'New Name',
    });
    expect(result.name).toBe('New Name');
  });

  it('parses with optional archive flag', () => {
    const result = updateInternalChatConversationSchema.parse({
      accountId: 'acc-1',
      conversationId: 'c',
      archive: true,
    });
    expect(result.archive).toBe(true);
  });

  it('rejects missing conversationId', () => {
    expect(() => updateInternalChatConversationSchema.parse({ name: 'n' })).toThrow();
  });
});

// ─── archiveInternalChatConversationSchema ─────────────────────────────────

describe('archiveInternalChatConversationSchema', () => {
  it('parses with conversationId', () => {
    expect(archiveInternalChatConversationSchema.parse({ accountId: 'acc-1', conversationId: 'conv-1' })).toMatchObject(
      { conversationId: 'conv-1' },
    );
  });

  it('rejects missing conversationId', () => {
    expect(() => archiveInternalChatConversationSchema.parse({})).toThrow();
  });
});

// ─── internalChatGroupMembersQuerySchema ──────────────────────────────────

describe('internalChatGroupMembersQuerySchema', () => {
  it('parses with conversationId', () => {
    expect(internalChatGroupMembersQuerySchema.parse({ conversationId: 'conv-1' })).toMatchObject({
      conversationId: 'conv-1',
    });
  });

  it('rejects missing conversationId', () => {
    expect(() => internalChatGroupMembersQuerySchema.parse({})).toThrow();
  });
});

// ─── addInternalChatGroupMemberSchema ─────────────────────────────────────

describe('addInternalChatGroupMemberSchema', () => {
  it('parses minimal valid input', () => {
    const result = addInternalChatGroupMemberSchema.parse({
      conversationId: 'conv-1',
      participantKey: 'user-1',
    });
    expect(result.participantKey).toBe('user-1');
    expect(result.role).toBe('normal'); // default
  });

  it('parses with explicit admin role', () => {
    const result = addInternalChatGroupMemberSchema.parse({
      conversationId: 'c',
      participantKey: 'p',
      role: 'admin',
    });
    expect(result.role).toBe('admin');
  });

  it('rejects invalid role', () => {
    expect(() =>
      addInternalChatGroupMemberSchema.parse({
        conversationId: 'c',
        participantKey: 'p',
        role: 'moderator',
      }),
    ).toThrow();
  });

  it('rejects missing conversationId', () => {
    expect(() => addInternalChatGroupMemberSchema.parse({ participantKey: 'p' })).toThrow();
  });
});

// ─── updateInternalChatGroupMemberRoleSchema ──────────────────────────────

describe('updateInternalChatGroupMemberRoleSchema', () => {
  it('parses with admin role', () => {
    const result = updateInternalChatGroupMemberRoleSchema.parse({
      conversationId: 'conv-1',
      participantKey: 'user-1',
      role: 'admin',
    });
    expect(result.role).toBe('admin');
  });

  it('parses with normal role', () => {
    const result = updateInternalChatGroupMemberRoleSchema.parse({
      conversationId: 'c',
      participantKey: 'p',
      role: 'normal',
    });
    expect(result.role).toBe('normal');
  });

  it('rejects invalid role', () => {
    expect(() =>
      updateInternalChatGroupMemberRoleSchema.parse({
        conversationId: 'c',
        participantKey: 'p',
        role: 'guest',
      }),
    ).toThrow();
  });

  it('rejects missing role', () => {
    expect(() =>
      updateInternalChatGroupMemberRoleSchema.parse({
        conversationId: 'c',
        participantKey: 'p',
      }),
    ).toThrow();
  });
});

// ─── removeInternalChatGroupMemberSchema ──────────────────────────────────

describe('removeInternalChatGroupMemberSchema', () => {
  it('parses valid input', () => {
    expect(
      removeInternalChatGroupMemberSchema.parse({
        conversationId: 'conv-1',
        participantKey: 'user-1',
      }),
    ).toMatchObject({ conversationId: 'conv-1', participantKey: 'user-1' });
  });

  it('rejects missing conversationId', () => {
    expect(() => removeInternalChatGroupMemberSchema.parse({ participantKey: 'p' })).toThrow();
  });

  it('rejects missing participantKey', () => {
    expect(() => removeInternalChatGroupMemberSchema.parse({ conversationId: 'c' })).toThrow();
  });
});

// ─── safeParse (non-throwing) ─────────────────────────────────────────────

describe('schema.safeParse', () => {
  it('adminInternalChatSendSchema safeParse returns success false for invalid input', () => {
    const result = adminInternalChatSendSchema.safeParse({ content: '' });
    expect(result.success).toBe(false);
  });

  it('createInternalChatConversationSchema safeParse returns success false for empty members', () => {
    const result = createInternalChatConversationSchema.safeParse({
      accountId: 'a',
      memberKeys: [],
    });
    expect(result.success).toBe(false);
  });

  it('sendInternalChatConversationMessageSchema safeParse returns success true for valid input', () => {
    const result = sendInternalChatConversationMessageSchema.safeParse({
      accountId: 'acc-1',
      conversationId: 'c',
      content: 'Hello',
    });
    expect(result.success).toBe(true);
    expect(result.data?.content).toBe('Hello');
  });
});
