import { describe, expect, it } from 'vitest';
import { InternalChatConversationRouteError } from './internal-chat-conversation-routes.errors';

describe('InternalChatConversationRouteError', () => {
  it('preserves verbatim cause as message', () => {
    const err = new InternalChatConversationRouteError('content too long');
    expect(err).toBeInstanceOf(InternalChatConversationRouteError);
    expect(err.name).toBe('InternalChatConversationRouteError');
    expect(err.code).toBe('INTERNAL_CHAT_CONVERSATION_ROUTE_ERROR');
    expect(err.cause).toBe('content too long');
    expect(err.message).toBe('content too long');
  });
});
