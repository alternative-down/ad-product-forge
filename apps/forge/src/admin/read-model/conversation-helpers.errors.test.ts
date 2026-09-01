import { describe, expect, it } from 'vitest';
import { InvalidConversationTypeError } from './conversation-helpers.errors';

describe('InvalidConversationTypeError', () => {
  it('preserves verbatim message format', () => {
    const err = new InvalidConversationTypeError('weird-type');
    expect(err).toBeInstanceOf(InvalidConversationTypeError);
    expect(err.name).toBe('InvalidConversationTypeError');
    expect(err.code).toBe('INVALID_CONVERSATION_TYPE');
    expect(err.raw).toBe('weird-type');
    expect(err.message).toBe('invalid conversation type: "weird-type"');
  });

  it('handles undefined raw value', () => {
    const err = new InvalidConversationTypeError(undefined);
    expect(err.raw).toBeUndefined();
    expect(err.message).toBe('invalid conversation type: undefined');
    // JSON.stringify(undefined) returns undefined (literal), so super receives 'undefined'
  });
});
