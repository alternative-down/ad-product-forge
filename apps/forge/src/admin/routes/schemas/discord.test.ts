import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const discordProviderDeleteSignalSchema = z.object({
  token: z.string(),
});

describe('discordProviderDeleteSignalSchema', () => {
  it('accepts valid token', () => {
    const result = discordProviderDeleteSignalSchema.parse({ token: 'abc123' });
    expect(result.token).toBe('abc123');
  });

  it('accepts empty string token', () => {
    const result = discordProviderDeleteSignalSchema.parse({ token: '' });
    expect(result.token).toBe('');
  });

  it('rejects missing token', () => {
    expect(() => discordProviderDeleteSignalSchema.parse({})).toThrow();
  });

  it('rejects numeric token', () => {
    expect(() => discordProviderDeleteSignalSchema.parse({ token: 12345 })).toThrow();
  });

  it('rejects boolean token', () => {
    expect(() => discordProviderDeleteSignalSchema.parse({ token: true })).toThrow();
  });
});
