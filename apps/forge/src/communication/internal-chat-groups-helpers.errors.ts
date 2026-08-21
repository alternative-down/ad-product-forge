/**
 * Typed Error subclasses for the communication/internal-chat-groups-helpers module (Pattern L, D52 #6502 batch 36).
 */
export class InternalChatParticipantNotFoundError extends Error {
  readonly code = 'INTERNAL_CHAT_PARTICIPANT_NOT_FOUND' as const;
  readonly participantKey: string;
  constructor(participantKey: string) {
    super(`Internal chat participant not found: ${participantKey}`);
    this.name = 'InternalChatParticipantNotFoundError';
    this.participantKey = participantKey;
  }
}
