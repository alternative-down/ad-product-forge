import { describe, expect, it } from 'vitest';
import { InternalChatDirectConversationCreationError } from './internal-chat-account-ops.errors';

describe('InternalChatDirectConversationCreationError', () => {
  it('preserves verbatim message', () => {
    const err = new InternalChatDirectConversationCreationError();
    expect(err).toBeInstanceOf(InternalChatDirectConversationCreationError);
    expect(err.name).toBe('InternalChatDirectConversationCreationError');
    expect(err.code).toBe('INTERNAL_CHAT_DIRECT_CONVERSATION_CREATION');
    expect(err.message).toBe('Direct conversation creation failed');
  });
});
