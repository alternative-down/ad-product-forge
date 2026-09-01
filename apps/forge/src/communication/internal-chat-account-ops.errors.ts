/**
 * Typed Error subclasses for the communication/internal-chat-account-ops module (Pattern L, D52 #6502 batch 36).
 */
export class InternalChatDirectConversationCreationError extends Error {
  readonly code = 'INTERNAL_CHAT_DIRECT_CONVERSATION_CREATION' as const;
  constructor() {
    super('Direct conversation creation failed');
    this.name = 'InternalChatDirectConversationCreationError';
  }
}
