import { describe, expect, test } from 'vitest';

import {
  InternalChatAccountNotFoundError,
  InternalChatDispatchFailedError,
} from './internal-chat-provider.errors';

describe('communication/internal-chat-provider errors', () => {
  describe('InternalChatAccountNotFoundError', () => {
    test('preserves verbatim message with agent id', () => {
      const err = new InternalChatAccountNotFoundError('agent-1');
      expect(err).toBeInstanceOf(InternalChatAccountNotFoundError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('InternalChatAccountNotFoundError');
      expect(err.code).toBe('INTERNAL_CHAT_ACCOUNT_NOT_FOUND');
      expect(err.agentId).toBe('agent-1');
      expect(err.message).toBe('Internal chat account not found for agent: agent-1');
    });

    test('handles uuid-style agent id', () => {
      const err = new InternalChatAccountNotFoundError('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(err.message).toBe(
        'Internal chat account not found for agent: a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      );
    });
  });

  describe('InternalChatDispatchFailedError', () => {
    test('preserves verbatim message verbatim from service error', () => {
      const err = new InternalChatDispatchFailedError('target key mismatch');
      expect(err).toBeInstanceOf(InternalChatDispatchFailedError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('InternalChatDispatchFailedError');
      expect(err.code).toBe('INTERNAL_CHAT_DISPATCH_FAILED');
      expect(err.serviceErrorMessage).toBe('target key mismatch');
      expect(err.message).toBe('target key mismatch');
    });
  });
});
