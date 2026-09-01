import { describe, expect, it } from 'vitest';
import { InternalChatParticipantNotFoundError } from './internal-chat-groups-helpers.errors';

describe('InternalChatParticipantNotFoundError', () => {
  it('preserves verbatim message', () => {
    const err = new InternalChatParticipantNotFoundError('agent-123');
    expect(err).toBeInstanceOf(InternalChatParticipantNotFoundError);
    expect(err.name).toBe('InternalChatParticipantNotFoundError');
    expect(err.code).toBe('INTERNAL_CHAT_PARTICIPANT_NOT_FOUND');
    expect(err.participantKey).toBe('agent-123');
    expect(err.message).toBe('Internal chat participant not found: agent-123');
  });
});
