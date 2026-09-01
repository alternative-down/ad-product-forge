/**
 * Unit tests for admin/routes/schemas/oauth.ts.
 * syncOauthSchema — zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import { syncOauthSchema } from './oauth';

describe('syncOauthSchema', () => {
  it('parses openai-codex provider', () => {
    expect(syncOauthSchema.parse({ provider: 'openai-codex' })).toMatchObject({
      provider: 'openai-codex',
    });
  });

  it('parses anthropic provider', () => {
    expect(syncOauthSchema.parse({ provider: 'anthropic' })).toMatchObject({
      provider: 'anthropic',
    });
  });

  it('parses all provider', () => {
    expect(syncOauthSchema.parse({ provider: 'all' })).toMatchObject({ provider: 'all' });
  });

  it('rejects unknown provider', () => {
    expect(() => syncOauthSchema.parse({ provider: 'google' })).toThrow();
  });

  it('rejects missing provider', () => {
    expect(() => syncOauthSchema.parse({})).toThrow();
  });

  it('rejects empty provider', () => {
    expect(() => syncOauthSchema.parse({ provider: '' })).toThrow();
  });
});

describe('syncOauthSchema.safeParse', () => {
  it('returns success true for valid openai-codex', () => {
    const result = syncOauthSchema.safeParse({ provider: 'openai-codex' });
    expect(result.success).toBe(true);
  });

  it('returns success false for unknown provider', () => {
    const result = syncOauthSchema.safeParse({ provider: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('returns success false for missing provider', () => {
    const result = syncOauthSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
