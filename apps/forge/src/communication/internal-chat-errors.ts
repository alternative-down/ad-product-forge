/**
 * Typed errors for the internal-chat module.
 * All errors carry structured fields so callers can act on them
 * without parsing human-readable messages.
 */

export class ConversationNotFoundError extends Error {
  readonly conversationId: string;

  constructor(conversationId: string) {
    super(`Conversation not found: ${conversationId}`);
    this.name = "ConversationNotFoundError";
    this.conversationId = conversationId;
  }
}

export class ChatGroupNotFoundError extends Error {
  readonly groupId: string;

  constructor(groupId: string) {
    super(`Chat group not found: ${groupId}`);
    this.name = "ChatGroupNotFoundError";
    this.groupId = groupId;
  }
}


class _GroupMemberAlreadyExistsError extends Error {
  readonly participantSlug: string;

  constructor(participantSlug: string) {
    super(`Group member already exists: ${participantSlug}`);
    this.name = "GroupMemberAlreadyExistsError";
    this.participantSlug = participantSlug;
  }
}

export class ChatGroupAlreadyExistsError extends Error {
  readonly conversationKey: string;

  constructor(conversationKey: string) {
    super(`Chat group already exists: ${conversationKey}`);
    this.name = "ChatGroupAlreadyExistsError";
    this.conversationKey = conversationKey;
  }
}

class _OnlyAdminsCanUpdateGroupError extends Error {
  constructor() {
    super("Only admins can update the group.");
    this.name = "OnlyAdminsCanUpdateGroupError";
  }
}

class _NameRequiredForNewGroupError extends Error {
  constructor() {
    super("name is required when creating a group.");
    this.name = "NameRequiredForNewGroupError";
  }
}

class _InternalChatParticipantNotFoundError extends Error {
  readonly participantKey: string;

  constructor(participantKey: string) {
    super(`Internal chat participant not found: ${participantKey}`);
    this.name = "InternalChatParticipantNotFoundError";
    this.participantKey = participantKey;
  }
}



export class InternalChatAccountNotFoundError extends Error {
  readonly slug: string;

  constructor(slug: string, message?: string) {
    super(message ?? `Internal chat account not found: ${slug}`);
    this.name = "InternalChatAccountNotFoundError";
    this.slug = slug;
  }
}

export class MessageNotFoundError extends Error {
  readonly messageId: string;

  constructor(messageId: string) {
    super(`Message not found: ${messageId}`);
    this.name = "MessageNotFoundError";
    this.messageId = messageId;
  }
}

export class ExternalAccountNotFoundError extends Error {
  readonly accountId: string;

  constructor(accountId: string, prefix?: string) {
    super(`${prefix ?? "External account not found"}: ${accountId}`);
    this.name = "ExternalAccountNotFoundError";
    this.accountId = accountId;
  }
}

class _InternalChatAccountSlugAlreadyExistsError extends Error {
  readonly slug: string;

  constructor(slug: string) {
    super(`Internal chat account slug already exists: ${slug}`);
    this.name = "InternalChatAccountSlugAlreadyExistsError";
    this.slug = slug;
  }
}

class _DirectConversationFailedError extends Error {
  constructor() {
    super("Failed to create direct conversation.");
    this.name = "DirectConversationFailedError";
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
    this.name = "AttachmentNotFoundError";
    this.attachmentName = attachmentName;
  }
}
