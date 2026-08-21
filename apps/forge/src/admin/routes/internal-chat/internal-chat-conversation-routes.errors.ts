/**
 * Typed Error subclasses for the admin/routes/internal-chat/internal-chat-conversation-routes module
 * (Pattern L, D52 #6502 batch 38).
 */
export class InternalChatConversationRouteError extends Error {
  readonly code = 'INTERNAL_CHAT_CONVERSATION_ROUTE_ERROR' as const;
  readonly cause: string;
  constructor(cause: string) {
    super(cause);
    this.name = 'InternalChatConversationRouteError';
    this.cause = cause;
  }
}
