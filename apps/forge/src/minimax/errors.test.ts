import { describe, expect, it } from 'vitest';

import {
  MiniMaxApiKeyNotSetError,
  MiniMaxIntegrationNotConfiguredError,
} from './errors';

describe('MiniMaxApiKeyNotSetError', () => {
  it('preserves verbatim message format', () => {
    const err = new MiniMaxApiKeyNotSetError();
    expect(err).toBeInstanceOf(MiniMaxApiKeyNotSetError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('MiniMaxApiKeyNotSetError');
    expect(err.code).toBe('MINIMAX_API_KEY_NOT_SET');
    expect(err.message).toBe('MINIMAX_API_KEY environment variable is not set');
    expect(err.stack).toBeDefined();
  });
});

describe('MiniMaxIntegrationNotConfiguredError', () => {
  it('preserves verbatim message format', () => {
    const err = new MiniMaxIntegrationNotConfiguredError();
    expect(err).toBeInstanceOf(MiniMaxIntegrationNotConfiguredError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('MiniMaxIntegrationNotConfiguredError');
    expect(err.code).toBe('MINIMAX_INTEGRATION_NOT_CONFIGURED');
    expect(err.message).toBe('MiniMax integration is not configured');
    expect(err.stack).toBeDefined();
  });
});
