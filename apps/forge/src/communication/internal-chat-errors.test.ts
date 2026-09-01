/**
 * Unit tests for communication/internal-chat-errors.ts.
 * All exported error classes — 0 prior coverage.
 * 3 tests existed for ChatGroupAlreadyExistsError; add full coverage for the rest.
 */
import { describe, expect, it } from 'vitest';
import {
  ConversationNotFoundError,
  ChatGroupNotFoundError,
  ChatGroupAlreadyExistsError,
  InternalChatAccountNotFoundError,
  MessageNotFoundError,
  ExternalAccountNotFoundError,
  InternalChatError,
  AttachmentNotFoundError,
  ChatGroupMemberAlreadyExistsError,
  ChatGroupAdminRequiredError,
  ChatGroupNameRequiredError,
  ConversationMembershipError,
  ReplyTargetMismatchError,
} from './internal-chat-errors';

describe('ConversationNotFoundError', () => {
  it('has correct name and message', () => {
    const error = new ConversationNotFoundError('conv-123');
    expect(error.name).toBe('ConversationNotFoundError');
    expect(error.message).toBe('Conversation not found: conv-123');
  });

  it('exposes conversationId field', () => {
    const error = new ConversationNotFoundError('conv-abc');
    expect(error.conversationId).toBe('conv-abc');
  });

  it('is an instance of Error', () => {
    const error = new ConversationNotFoundError('x');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ConversationNotFoundError);
  });
});

describe('ChatGroupNotFoundError', () => {
  it('has correct name and message', () => {
    const error = new ChatGroupNotFoundError('group-99');
    expect(error.name).toBe('ChatGroupNotFoundError');
    expect(error.message).toBe('Chat group not found: group-99');
  });

  it('exposes groupId field', () => {
    const error = new ChatGroupNotFoundError('group-xyz');
    expect(error.groupId).toBe('group-xyz');
  });

  it('is an instance of Error', () => {
    const error = new ChatGroupNotFoundError('x');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ChatGroupNotFoundError);
  });
});

describe('ChatGroupAlreadyExistsError', () => {
  it('has correct name and message', () => {
    const error = new ChatGroupAlreadyExistsError('group-key-123');
    expect(error.name).toBe('ChatGroupAlreadyExistsError');
    expect(error.message).toBe('Chat group already exists: group-key-123');
  });

  it('exposes conversationKey field', () => {
    const error = new ChatGroupAlreadyExistsError('my-conversation');
    expect(error.conversationKey).toBe('my-conversation');
  });

  it('is an instance of Error', () => {
    const error = new ChatGroupAlreadyExistsError('key');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ChatGroupAlreadyExistsError);
  });
});

describe('InternalChatAccountNotFoundError', () => {
  it('has correct name and default message', () => {
    const error = new InternalChatAccountNotFoundError('alice');
    expect(error.name).toBe('InternalChatAccountNotFoundError');
    expect(error.message).toBe('Internal chat account not found: alice');
  });

  it('uses custom message when provided', () => {
    const error = new InternalChatAccountNotFoundError('bob', 'Account bob does not exist');
    expect(error.message).toBe('Account bob does not exist');
  });

  it('exposes slug field', () => {
    const error = new InternalChatAccountNotFoundError('my-slug');
    expect(error.slug).toBe('my-slug');
  });

  it('is an instance of Error', () => {
    const error = new InternalChatAccountNotFoundError('x');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(InternalChatAccountNotFoundError);
  });
});

describe('MessageNotFoundError', () => {
  it('has correct name and message', () => {
    const error = new MessageNotFoundError('msg-456');
    expect(error.name).toBe('MessageNotFoundError');
    expect(error.message).toBe('Message not found: msg-456');
  });

  it('exposes messageId field', () => {
    const error = new MessageNotFoundError('msg-abc');
    expect(error.messageId).toBe('msg-abc');
  });

  it('is an instance of Error', () => {
    const error = new MessageNotFoundError('x');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MessageNotFoundError);
  });
});

describe('ExternalAccountNotFoundError', () => {
  it('has correct name and default message', () => {
    const error = new ExternalAccountNotFoundError('ext-789');
    expect(error.name).toBe('ExternalAccountNotFoundError');
    expect(error.message).toBe('External account not found: ext-789');
  });

  it('uses custom prefix when provided', () => {
    const error = new ExternalAccountNotFoundError('ext-123', 'Human account not found');
    expect(error.message).toBe('Human account not found: ext-123');
  });

  it('exposes accountId field', () => {
    const error = new ExternalAccountNotFoundError('acct-xyz');
    expect(error.accountId).toBe('acct-xyz');
  });

  it('is an instance of Error', () => {
    const error = new ExternalAccountNotFoundError('x');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ExternalAccountNotFoundError);
  });
});

describe('InternalChatError', () => {
  it('has correct name', () => {
    const error = new InternalChatError('ERR_CODE', 'Something went wrong');
    expect(error.name).toBe('InternalChatError');
  });

  it('exposes code field', () => {
    const error = new InternalChatError('ERR_CODE', 'boom');
    expect(error.code).toBe('ERR_CODE');
  });

  it('has provided message', () => {
    const error = new InternalChatError('ERR_CODE', 'boom');
    expect(error.message).toBe('boom');
  });

  it('defaults code to unknown', () => {
    const error = new InternalChatError('unknown', 'default error');
    expect(error.code).toBe('unknown');
  });

  it('is an instance of Error', () => {
    const error = new InternalChatError('ERR_CODE', 'boom');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(InternalChatError);
  });
});

describe('AttachmentNotFoundError', () => {
  it('has correct name and message', () => {
    const error = new AttachmentNotFoundError('report.pdf');
    expect(error.name).toBe('AttachmentNotFoundError');
    expect(error.message).toBe('Attachment not found: report.pdf');
  });

  it('exposes attachmentName field', () => {
    const error = new AttachmentNotFoundError('image.png');
    expect(error.attachmentName).toBe('image.png');
  });

  it('is an instance of Error', () => {
    const error = new AttachmentNotFoundError('x');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AttachmentNotFoundError);
  });
});


describe('ChatGroupMemberAlreadyExistsError', () => {
  it('has correct name and message', () => {
    const error = new ChatGroupMemberAlreadyExistsError('participant-slug-1');
    expect(error.name).toBe('ChatGroupMemberAlreadyExistsError');
    expect(error.message).toBe('Group member already exists: participant-slug-1');
  });

  it('exposes participantSlug field', () => {
    const error = new ChatGroupMemberAlreadyExistsError('agent_x');
    expect(error.participantSlug).toBe('agent_x');
  });

  it('is an instance of Error', () => {
    const error = new ChatGroupMemberAlreadyExistsError('x');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('ChatGroupAdminRequiredError', () => {
  it('has correct name and message', () => {
    const error = new ChatGroupAdminRequiredError();
    expect(error.name).toBe('ChatGroupAdminRequiredError');
    expect(error.message).toBe('Only admins can update the group.');
  });

  it('is an instance of Error', () => {
    const error = new ChatGroupAdminRequiredError();
    expect(error).toBeInstanceOf(Error);
  });
});

describe('ChatGroupNameRequiredError', () => {
  it('has correct name and message', () => {
    const error = new ChatGroupNameRequiredError();
    expect(error.name).toBe('ChatGroupNameRequiredError');
    expect(error.message).toBe('name is required when creating a group.');
  });

  it('is an instance of Error', () => {
    const error = new ChatGroupNameRequiredError();
    expect(error).toBeInstanceOf(Error);
  });
});

describe('ConversationMembershipError', () => {
  it('has correct name and message', () => {
    const error = new ConversationMembershipError('agent_001', 'conv_abc');
    expect(error.name).toBe('ConversationMembershipError');
    expect(error.message).toBe('Agent is not a member of this conversation: conv_abc');
  });

  it('exposes agentId and conversationId fields', () => {
    const error = new ConversationMembershipError('a', 'c');
    expect(error.agentId).toBe('a');
    expect(error.conversationId).toBe('c');
  });

  it('is an instance of Error', () => {
    const error = new ConversationMembershipError('a', 'c');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('ReplyTargetMismatchError', () => {
  it('has correct name and message', () => {
    const error = new ReplyTargetMismatchError('msg_1', 'conv_a', 'conv_b');
    expect(error.name).toBe('ReplyTargetMismatchError');
    expect(error.message).toBe('Reply target belongs to a different conversation: msg_1');
  });

  it('exposes messageId, expectedConversationId, actualConversationId fields', () => {
    const error = new ReplyTargetMismatchError('m', 'a', 'b');
    expect(error.messageId).toBe('m');
    expect(error.expectedConversationId).toBe('a');
    expect(error.actualConversationId).toBe('b');
  });

  it('is an instance of Error', () => {
    const error = new ReplyTargetMismatchError('m', 'a', 'b');
    expect(error).toBeInstanceOf(Error);
  });
});
