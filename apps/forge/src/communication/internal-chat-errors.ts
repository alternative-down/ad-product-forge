/**
 * Typed errors for the internal-chat module.
 * All errors carry structured fields so callers can act on them
 * without parsing human-readable messages.
 */

export class ConversationNotFoundError extends Error {
  readonly conversationId: string;

  constructor(conversationId: string) {
    super(`Conversation not found: ${conversationId}`);
    this.name = 'ConversationNotFoundError';
    this.conversationId = conversationId;
  }
}

export class ChatGroupNotFoundError extends Error {
  readonly groupId: string;

  constructor(groupId: string) {
    super(`Chat group not found: ${groupId}`);
    this.name = 'ChatGroupNotFoundError';
    this.groupId = groupId;
  }
}
export class ChatGroupAlreadyExistsError extends Error {
  readonly conversationKey: string;

  constructor(conversationKey: string) {
    super(`Chat group already exists: ${conversationKey}`);
    this.name = 'ChatGroupAlreadyExistsError';
    this.conversationKey = conversationKey;
  }
}


export class InternalChatAccountNotFoundError extends Error {
  readonly slug: string;

  constructor(slug: string, message?: string) {
    super(message ?? `Internal chat account not found: ${slug}`);
    this.name = 'InternalChatAccountNotFoundError';
    this.slug = slug;
  }
}

export class MessageNotFoundError extends Error {
  readonly messageId: string;

  constructor(messageId: string) {
    super(`Message not found: ${messageId}`);
    this.name = 'MessageNotFoundError';
    this.messageId = messageId;
  }
}

export class ExternalAccountNotFoundError extends Error {
  readonly accountId: string;

  constructor(accountId: string, prefix?: string) {
    super(`${prefix ?? 'External account not found'}: ${accountId}`);
    this.name = 'ExternalAccountNotFoundError';
    this.accountId = accountId;
  }
}



export class InternalChatError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'InternalChatError';
    this.code = code;
  }
}

export class AttachmentNotFoundError extends Error {
  readonly attachmentName: string;

  constructor(attachmentName: string) {
    super(`Attachment not found: ${attachmentName}`);
    this.name = 'AttachmentNotFoundError';
    this.attachmentName = attachmentName;
  }
}
