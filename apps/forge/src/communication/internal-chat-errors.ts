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

/**
 * Pattern L typed errors for D51 #6596 batch 8 — internal-chat-{groups,admin,sending} completion.
 * Replaces remaining 8 raw `throw new Error(...)` calls (5 in groups, 3 in admin/sending after reusing
 * existing classes) with typed Error subclasses.
 *
 * Pattern reference: apps/forge/src/communication/internal-chat-service.errors.ts (D50 #6502 batch 6).
 */
export class ChatGroupMemberAlreadyExistsError extends Error {
  readonly participantSlug: string;

  constructor(participantSlug: string) {
    super(`Group member already exists: ${participantSlug}`);
    this.name = 'ChatGroupMemberAlreadyExistsError';
    this.participantSlug = participantSlug;
  }
}

export class ChatGroupAdminRequiredError extends Error {
  constructor() {
    super('Only admins can update the group.');
    this.name = 'ChatGroupAdminRequiredError';
  }
}

export class ChatGroupNameRequiredError extends Error {
  constructor() {
    super('name is required when creating a group.');
    this.name = 'ChatGroupNameRequiredError';
  }
}

export class ConversationMembershipError extends Error {
  readonly agentId: string;
  readonly conversationId: string;

  constructor(agentId: string, conversationId: string) {
    super(`Agent is not a member of this conversation: ${conversationId}`);
    this.name = 'ConversationMembershipError';
    this.agentId = agentId;
    this.conversationId = conversationId;
  }
}

export class ReplyTargetMismatchError extends Error {
  readonly messageId: string;
  readonly expectedConversationId: string;
  readonly actualConversationId: string;

  constructor(
    messageId: string,
    expectedConversationId: string,
    actualConversationId: string,
  ) {
    super(
      `Reply target belongs to a different conversation: ${messageId}`,
    );
    this.name = 'ReplyTargetMismatchError';
    this.messageId = messageId;
    this.expectedConversationId = expectedConversationId;
    this.actualConversationId = actualConversationId;
  }
}
