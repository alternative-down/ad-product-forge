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

export class ChatGroupAlreadyExistsError extends Error {
  readonly conversationKey: string;

  constructor(conversationKey: string) {
    super(`Chat group already exists: ${conversationKey}`);
    this.name = "ChatGroupAlreadyExistsError";
    this.conversationKey = conversationKey;
  }
}

export class GroupMemberAlreadyExistsError extends Error {
  readonly participantSlug: string;

  constructor(participantSlug: string) {
    super(`Group member already exists: ${participantSlug}`);
    this.name = "GroupMemberAlreadyExistsError";
    this.participantSlug = participantSlug;
  }
}

export class OnlyAdminsCanUpdateGroupError extends Error {
  constructor() {
    super("Only admins can update the group.");
    this.name = "OnlyAdminsCanUpdateGroupError";
  }
}

export class NameRequiredForNewGroupError extends Error {
  constructor() {
    super("name is required when creating a group.");
    this.name = "NameRequiredForNewGroupError";
  }
}

export class InternalChatParticipantNotFoundError extends Error {
  readonly participantKey: string;

  constructor(participantKey: string) {
    super(`Internal chat participant not found: ${participantKey}`);
    this.name = "InternalChatParticipantNotFoundError";
    this.participantKey = participantKey;
  }
}

export class ExternalChatGroupAlreadyExistsError extends Error {
  readonly conversationKey: string;

  constructor(conversationKey: string) {
    super(`Chat group already exists: ${conversationKey}`);
    this.name = "ExternalChatGroupAlreadyExistsError";
    this.conversationKey = conversationKey;
  }
}

export class OnlyAdminsCanUpdateGroupByAccountError extends Error {
  constructor() {
    super("Only admins can update the group.");
    this.name = "OnlyAdminsCanUpdateGroupByAccountError";
  }
}

export class InternalChatAccountNotFoundError extends Error {
  readonly slug: string;

  constructor(slug: string) {
    super(`Internal chat participant not found: ${slug}`);
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