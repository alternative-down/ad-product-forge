/**
 * Typed Error subclasses for the admin/read-model/conversation-helpers module
 * (Pattern L, D52 #6502 batch 38).
 */
export class InvalidConversationTypeError extends Error {
  readonly code = 'INVALID_CONVERSATION_TYPE' as const;
  readonly raw: string | undefined;
  constructor(raw: string | undefined) {
    super(`invalid conversation type: ${JSON.stringify(raw)}`);
    this.name = 'InvalidConversationTypeError';
    this.raw = raw;
  }
}
