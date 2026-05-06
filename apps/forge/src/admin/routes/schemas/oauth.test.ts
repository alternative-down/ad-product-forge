import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { syncOauthSchema } from './oauth';

describe('syncOauthSchema', () => {
  it('validates openai-codex provider', () => {
    const result = syncOauthSchema.parse({ provider: 'openai-codex' });
    expect(result.provider).toBe('openai-codex');
  });

  it('validates anthropic provider', () => {
    const result = syncOauthSchema.parse({ provider: 'anthropic' });
    expect(result.provider).toBe('anthropic');
  });

  it('validates all provider', () => {
    const result = syncOauthSchema.parse({ provider: 'all' });
    expect(result.provider).toBe('all');
  });

  it('rejects invalid provider', () => {
    expect(() => syncOauthSchema.parse({ provider: 'invalid' })).toThrow();
  });

  it('rejects missing provider', () => {
    expect(() => syncOauthSchema.parse({})).toThrow();
  });

  it('rejects empty provider string', () => {
    expect(() => syncOauthSchema.parse({ provider: '' })).toThrow();
  });
});
