/**
 * Unit tests for admin/routes/schemas/internal-chat.ts.
 * Zod validation schemas for internal chat account and conversation management.
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

// ─── adminInternalChatSendSchema ─────────────────────────────────────────

describe('adminInternalChatSendSchema', () => {
  it('parses valid input', () => {
    expect(adminInternalChatSendSchema.parse({
      agentId: 'agent-1', targetKey: 'user-123', provider: 'internal', content: 'Hello',
    })).toMatchObject({ agentId: 'agent-1', targetKey: 'user-123', provider: 'internal' });
  });

  it('rejects missing agentId', () => {
    expect(() => adminInternalChatSendSchema.parse({ targetKey: 'k', provider: 'p', content: 'c' })).toThrow();
  });

  it('rejects empty agentId', () => {
    expect(() => adminInternalChatSendSchema.parse({ agentId: '', targetKey: 'k', provider: 'p', content: 'c' })).toThrow();
  });

  it('rejects missing targetKey', () => {
    expect(() => adminInternalChatSendSchema.parse({ agentId: 'a', provider: 'p', content: 'c' })).toThrow();
  });

  it('rejects missing content', () => {
    expect(() => adminInternalChatSendSchema.parse({ agentId: 'a', targetKey: 'k', provider: 'p' })).toThrow();
  });
});

// ─── createExternalInternalChatAccountSchema ───────────────────────────

describe('createExternalInternalChatAccountSchema', () => {
  it('parses valid input with provider and targetKey', () => {
    expect(createExternalInternalChatAccountSchema.parse({ provider: 'slack', targetKey: 'U123' }))
      .toMatchObject({ provider: 'slack', targetKey: 'U123' });
  });

  it('parses with optional name', () => {
    expect(createExternalInternalChatAccountSchema.parse({ provider: 'p', targetKey: 't', name: 'My Bot' }))
      .toMatchObject({ name: 'My Bot' });
  });

  it('rejects missing provider', () => {
    expect(() => createExternalInternalChatAccountSchema.parse({ targetKey: 't' })).toThrow();
  });

  it('rejects missing targetKey', () => {
    expect(() => createExternalInternalChatAccountSchema.parse({ provider: 'p' })).toThrow();
  });

  it('rejects empty provider', () => {
    expect(() => createExternalInternalChatAccountSchema.parse({ provider: '', targetKey: 't' })).toThrow();
  });
});

// ─── updateExternalInternalChatAccountSchema ───────────────────────────

describe('updateExternalInternalChatAccountSchema', () => {
  it('parses with accountId only', () => {
    expect(updateExternalInternalChatAccountSchema.parse({ accountId: 'acc-1' }))
      .toMatchObject({ accountId: 'acc-1' });
  });

  it('parses with name', () => {
    expect(updateExternalInternalChatAccountSchema.parse({ accountId: 'a', name: 'Updated Bot' }))
      .toMatchObject({ name: 'Updated Bot' });
  });

  it('rejects missing accountId', () => {
    expect(() => updateExternalInternalChatAccountSchema.parse({})).toThrow();
  });

  it('rejects empty accountId', () => {
    expect(() => updateExternalInternalChatAccountSchema.parse({ accountId: '' })).toThrow();
  });
});

// ─── deleteExternalInternalChatAccountSchema ────────────────────────────

describe('deleteExternalInternalChatAccountSchema', () => {
  it('parses valid accountId', () => {
    expect(deleteExternalInternalChatAccountSchema.parse({ accountId: 'acc-1' }))
      .toMatchObject({ accountId: 'acc-1' });
  });

  it('rejects missing accountId', () => {
    expect(() => deleteExternalInternalChatAccountSchema.parse({})).toThrow();
  });

  it('rejects empty accountId', () => {
    expect(() => deleteExternalInternalChatAccountSchema.parse({ accountId: '' })).toThrow();
  });
});

// ─── internalChatAccountIdQuerySchema ────────────────────────────────

describe('internalChatAccountIdQuerySchema', () => {
  it('parses valid accountId', () => {
    expect(internalChatAccountIdQuerySchema.parse({ accountId: 'acc-1' }))
      .toMatchObject({ accountId: 'acc-1' });
  });

  it('rejects missing accountId', () => {
    expect(() => internalChatAccountIdQuerySchema.parse({})).toThrow();
  });

  it('rejects empty accountId', () => {
    expect(() => internalChatAccountIdQuerySchema.parse({ accountId: '' })).toThrow();
  });
});

// ─── internalChatMessagesQuerySchema ──────────────────────────────────

describe('internalChatMessagesQuerySchema', () => {
  it('parses valid accountId and conversationId', () => {
    expect(internalChatMessagesQuerySchema.parse({ accountId: 'acc-1', conversationId: 'conv-1' }))
      .toMatchObject({ accountId: 'acc-1', conversationId: 'conv-1' });
  });

  it('defaults limit and offset', () => {
    const result = internalChatMessagesQuerySchema.parse({ accountId: 'a', conversationId: 'c' });
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it('accepts custom limit and offset (coerced from string)', () => {
    const result = internalChatMessagesQuerySchema.parse({ accountId: 'a', conversationId: 'c', limit: '50', offset: '10' });
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(10);
  });

  it('rejects missing accountId', () => {
    expect(() => internalChatMessagesQuerySchema.parse({ conversationId: 'c' })).toThrow();
  });

  it('rejects missing conversationId', () => {
    expect(() => internalChatMessagesQuerySchema.parse({ accountId: 'a' })).toThrow();
  });

  it('rejects limit > 100', () => {
    expect(() => internalChatMessagesQuerySchema.parse({ accountId: 'a', conversationId: 'c', limit: 200 })).toThrow();
  });
});

// ─── internalChatMessageAttachmentQuerySchema ───────────────────────────

describe('internalChatMessageAttachmentQuerySchema', () => {
  it('parses valid input with all required fields', () => {
    expect(internalChatMessageAttachmentQuerySchema.parse({
      accountId: 'acc-1', conversationId: 'conv-1', messageId: 'msg-1', attachmentName: 'file.pdf',
    })).toMatchObject({ messageId: 'msg-1', attachmentName: 'file.pdf' });
  });

  it('rejects missing accountId', () => {
    expect(() => internalChatMessageAttachmentQuerySchema.parse({ conversationId: 'c', messageId: 'm', attachmentName: 'f' })).toThrow();
  });

  it('rejects missing attachmentName', () => {
    expect(() => internalChatMessageAttachmentQuerySchema.parse({ accountId: 'a', conversationId: 'c', messageId: 'm' })).toThrow();
  });
});

// ─── createInternalChatConversationSchema ──────────────────────────────

describe('createInternalChatConversationSchema', () => {
  it('parses valid input with accountId and memberKeys', () => {
    expect(createInternalChatConversationSchema.parse({ accountId: 'acc-1', memberKeys: ['user-1', 'user-2'] }))
      .toMatchObject({ accountId: 'acc-1' });
  });

  it('parses with optional name', () => {
    expect(createInternalChatConversationSchema.parse({ accountId: 'a', memberKeys: ['u'], name: 'Team Chat' }))
      .toMatchObject({ name: 'Team Chat' });
  });

  it('rejects missing accountId', () => {
    expect(() => createInternalChatConversationSchema.parse({ memberKeys: ['u'] })).toThrow();
  });

  it('rejects empty memberKeys array', () => {
    expect(() => createInternalChatConversationSchema.parse({ accountId: 'a', memberKeys: [] })).toThrow();
  });
});

// ─── sendInternalChatConversationMessageSchema ──────────────────────────

describe('sendInternalChatConversationMessageSchema', () => {
  it('parses valid conversationId and content', () => {
    expect(sendInternalChatConversationMessageSchema.parse({ conversationId: 'conv-1', content: 'Hello' }))
      .toMatchObject({ conversationId: 'conv-1', content: 'Hello' });
  });

  it('parses with optional parentMessageId', () => {
    const result = sendInternalChatConversationMessageSchema.parse({ conversationId: 'c', content: 'Hi', parentMessageId: 'parent-1' });
    expect(result.parentMessageId).toBe('parent-1');
  });

  it('rejects missing conversationId', () => {
    expect(() => sendInternalChatConversationMessageSchema.parse({ content: 'Hi' })).toThrow();
  });

  it('rejects missing content', () => {
    expect(() => sendInternalChatConversationMessageSchema.parse({ conversationId: 'c' })).toThrow();
  });

  it('rejects empty conversationId', () => {
    expect(() => sendInternalChatConversationMessageSchema.parse({ conversationId: '', content: 'x' })).toThrow();
  });
});

// ─── updateInternalChatConversationSchema ─────────────────────────────

describe('updateInternalChatConversationSchema', () => {
  it('parses with conversationId only', () => {
    expect(updateInternalChatConversationSchema.parse({ conversationId: 'conv-1' }))
      .toMatchObject({ conversationId: 'conv-1' });
  });

  it('parses with archive flag', () => {
    const result = updateInternalChatConversationSchema.parse({ conversationId: 'c', archive: true });
    expect(result.archive).toBe(true);
  });

  it('rejects missing conversationId', () => {
    expect(() => updateInternalChatConversationSchema.parse({})).toThrow();
  });
});

// ─── archiveInternalChatConversationSchema ─────────────────────────────

describe('archiveInternalChatConversationSchema', () => {
  it('parses valid conversationId', () => {
    expect(archiveInternalChatConversationSchema.parse({ conversationId: 'conv-1' }))
      .toMatchObject({ conversationId: 'conv-1' });
  });

  it('rejects missing conversationId', () => {
    expect(() => archiveInternalChatConversationSchema.parse({})).toThrow();
  });

  it('rejects empty conversationId', () => {
    expect(() => archiveInternalChatConversationSchema.parse({ conversationId: '' })).toThrow();
  });
});

// ─── internalChatGroupMembersQuerySchema ─────────────────────────────

describe('internalChatGroupMembersQuerySchema', () => {
  it('parses valid conversationId', () => {
    expect(internalChatGroupMembersQuerySchema.parse({ conversationId: 'conv-1' }))
      .toMatchObject({ conversationId: 'conv-1' });
  });

  it('rejects missing conversationId', () => {
    expect(() => internalChatGroupMembersQuerySchema.parse({})).toThrow();
  });
});

// ─── addInternalChatGroupMemberSchema ─────────────────────────────────

describe('addInternalChatGroupMemberSchema', () => {
  it('parses valid conversationId and participantKey', () => {
    expect(addInternalChatGroupMemberSchema.parse({ conversationId: 'conv-1', participantKey: 'user-1' }))
      .toMatchObject({ conversationId: 'conv-1', participantKey: 'user-1' });
  });

  it('defaults role to normal', () => {
    const result = addInternalChatGroupMemberSchema.parse({ conversationId: 'c', participantKey: 'p' });
    expect(result.role).toBe('normal');
  });

  it('accepts admin role', () => {
    const result = addInternalChatGroupMemberSchema.parse({ conversationId: 'c', participantKey: 'p', role: 'admin' });
    expect(result.role).toBe('admin');
  });

  it('rejects invalid role', () => {
    expect(() => addInternalChatGroupMemberSchema.parse({ conversationId: 'c', participantKey: 'p', role: 'owner' })).toThrow();
  });

  it('rejects missing conversationId', () => {
    expect(() => addInternalChatGroupMemberSchema.parse({ participantKey: 'p' })).toThrow();
  });

  it('rejects missing participantKey', () => {
    expect(() => addInternalChatGroupMemberSchema.parse({ conversationId: 'c' })).toThrow();
  });
});

// ─── updateInternalChatGroupMemberRoleSchema ─────────────────────────

describe('updateInternalChatGroupMemberRoleSchema', () => {
  it('parses valid conversationId, participantKey, and role', () => {
    expect(updateInternalChatGroupMemberRoleSchema.parse({ conversationId: 'conv-1', participantKey: 'user-1', role: 'admin' }))
      .toMatchObject({ role: 'admin' });
  });

  it('accepts normal role', () => {
    expect(updateInternalChatGroupMemberRoleSchema.parse({ conversationId: 'c', participantKey: 'p', role: 'normal' }))
      .toMatchObject({ role: 'normal' });
  });

  it('rejects invalid role', () => {
    expect(() => updateInternalChatGroupMemberRoleSchema.parse({ conversationId: 'c', participantKey: 'p', role: 'superadmin' })).toThrow();
  });

  it('rejects missing conversationId', () => {
    expect(() => updateInternalChatGroupMemberRoleSchema.parse({ participantKey: 'p', role: 'normal' })).toThrow();
  });
});

// ─── removeInternalChatGroupMemberSchema ─────────────────────────────

describe('removeInternalChatGroupMemberSchema', () => {
  it('parses valid conversationId and participantKey', () => {
    expect(removeInternalChatGroupMemberSchema.parse({ conversationId: 'conv-1', participantKey: 'user-1' }))
      .toMatchObject({ conversationId: 'conv-1', participantKey: 'user-1' });
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
  it('adminInternalChatSendSchema safeParse returns success false for missing content', () => {
    const result = adminInternalChatSendSchema.safeParse({ agentId: 'a', targetKey: 'k', provider: 'p' });
    expect(result.success).toBe(false);
  });

  it('createExternalInternalChatAccountSchema safeParse returns success true for valid input', () => {
    const result = createExternalInternalChatAccountSchema.safeParse({ provider: 'p', targetKey: 't' });
    expect(result.success).toBe(true);
  });

  it('sendInternalChatConversationMessageSchema safeParse returns success false for missing content', () => {
    const result = sendInternalChatConversationMessageSchema.safeParse({ conversationId: 'c' });
    expect(result.success).toBe(false);
  });

  it('addInternalChatGroupMemberSchema safeParse returns success false for missing participantKey', () => {
    const result = addInternalChatGroupMemberSchema.safeParse({ conversationId: 'c' });
    expect(result.success).toBe(false);
  });

  it('removeInternalChatGroupMemberSchema safeParse returns success true for valid input', () => {
    const result = removeInternalChatGroupMemberSchema.safeParse({ conversationId: 'c', participantKey: 'p' });
    expect(result.success).toBe(true);
  });
});