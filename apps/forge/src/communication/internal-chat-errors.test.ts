import { describe, expect, it } from 'vitest';
import { ChatGroupAlreadyExistsError } from './internal-chat-errors';

describe('ChatGroupAlreadyExistsError', () => {
  it('has correct name and message', () => {
    const error = new ChatGroupAlreadyExistsError('group-key-123');
    expect(error.name).toBe('ChatGroupAlreadyExistsError');
    expect(error.message).toBe('Chat group already exists: group-key-123');
  });

  it('exposes conversationKey field', () => {
    const error = new ChatGroupAlreadyExistsError('my-conversation');
    expect(error.conversationKey).toBe('my-conversation');
  });

  it('is an instance of Error', () => {
    const error = new ChatGroupAlreadyExistsError('key');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ChatGroupAlreadyExistsError);
  });
});