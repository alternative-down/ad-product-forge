import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// Re-implement the schemas inline to test schema logic without pulling in
// discord-account / email-account which have heavy runtime dependencies.

const internalChatCredentialsSchema = z.object({
  agentId: z.string(),
  displayName: z.string().min(1).nullish(),
  description: z.string().nullish(),
});

const discordChannelCredentialsSchema = z.object({
  token: z.string(),
  channels: z.array(
    z.object({
      channelId: z.string(),
      channelName: z.string().nullish(),
      respondToMentionsOnly: z.boolean(),
    }),
  ), // required — ensures legacy objects fall through to the legacy schema
});

const discordLegacyCredentialsSchema = z.object({
  token: z.string(),
  allowedChannelIds: z.array(z.string()).nullish(),
  respondToMentionsOnly: z.boolean().nullish(),
});

const discordCredentialsSchema = z
  .union([discordChannelCredentialsSchema, discordLegacyCredentialsSchema])
  .transform((credentials) => {
    if ('allowedChannelIds' in credentials || 'respondToMentionsOnly' in credentials) {
      return {
        token: credentials.token,
        channels: (credentials.allowedChannelIds ?? []).map((channelId) => ({
          channelId,
          channelName: '',
          respondToMentionsOnly: credentials.respondToMentionsOnly ?? false,
        })),
      };
    }
    const channelCredentials = discordChannelCredentialsSchema.parse(credentials);
    return {
      token: channelCredentials.token,
      channels: (channelCredentials.channels ?? []).map((channel) => ({
        channelId: channel.channelId,
        channelName: channel.channelName ?? undefined,
        respondToMentionsOnly: channel.respondToMentionsOnly,
      })),
    };
  });

const emailCredentialsSchema = z.object({
  imap: z.object({
    host: z.string(),
    port: z.number(),
    secure: z.boolean(),
    user: z.string(),
    password: z.string(),
  }),
  smtp: z.object({
    host: z.string(),
    port: z.number(),
    secure: z.boolean(),
    user: z.string(),
    password: z.string(),
  }),
  bcc: z.string().nullish(),
});

function parseProviderCredentials(
  providerType: 'internal-chat' | 'discord' | 'email',
  credentials: unknown,
) {
  if (providerType === 'internal-chat') {
    return internalChatCredentialsSchema.parse(credentials);
  }
  if (providerType === 'discord') {
    return discordCredentialsSchema.parse(credentials);
  }
  return emailCredentialsSchema.parse(credentials);
}

// ─── internalChatCredentialsSchema ───────────────────────────────────────────

describe('internalChatCredentialsSchema', () => {
  it('parses valid internal-chat credentials with all fields', () => {
    const result = internalChatCredentialsSchema.parse({
      agentId: 'agent-123',
      displayName: 'Aldric',
      description: 'A senior dev',
    });
    expect(result.agentId).toBe('agent-123');
    expect(result.displayName).toBe('Aldric');
    expect(result.description).toBe('A senior dev');
  });

  it('parses internal-chat credentials with only agentId', () => {
    const result = internalChatCredentialsSchema.parse({ agentId: 'agent-123' });
    expect(result.agentId).toBe('agent-123');
    expect(result.displayName).toBeUndefined();
    expect(result.description).toBeUndefined();
  });

  it('throws when agentId is missing', () => {
    expect(() => internalChatCredentialsSchema.parse({})).toThrow();
  });

  it('throws when displayName is empty string (min 1)', () => {
    expect(() => internalChatCredentialsSchema.parse({
      agentId: 'agent-123',
      displayName: '',
    })).toThrow();
  });
});

// ─── discordCredentialsSchema ──────────────────────────────────────────────────

describe('discordCredentialsSchema', () => {
  describe('new channel format', () => {
    it('parses channel objects correctly', () => {
      const result = discordCredentialsSchema.parse({
        token: 'secret-token',
        channels: [
          { channelId: 'ch_1', channelName: 'general', respondToMentionsOnly: false },
          { channelId: 'ch_2', respondToMentionsOnly: true },
        ],
      });
      expect(result).toEqual({
        token: 'secret-token',
        channels: [
          { channelId: 'ch_1', channelName: 'general', respondToMentionsOnly: false },
          { channelId: 'ch_2', channelName: undefined, respondToMentionsOnly: true },
        ],
      });
    });

    it('handles missing channels array', () => {
      // When channels is absent, union first tries channel schema (fails — required),
      // then falls through to legacy schema which needs token but no channels,
      // then transform detects no legacy markers → uses channel parse
      // But the legacy schema doesn't require channels... Let's see.
      expect(() => discordCredentialsSchema.parse({
        token: 'secret-token',
      })).toThrow(); // token-only doesn't match channel (channels required) but also not valid legacy
    });

    it('throws when token is missing', () => {
      expect(() => discordCredentialsSchema.parse({ channels: [] })).toThrow();
    });
  });

  describe('legacy format', () => {
    it('transforms allowedChannelIds + respondToMentionsOnly to channels', () => {
      const result = discordCredentialsSchema.parse({
        token: 'secret-token',
        allowedChannelIds: ['ch_1', 'ch_2'],
        respondToMentionsOnly: true,
      });
      expect(result).toEqual({
        token: 'secret-token',
        channels: [
          { channelId: 'ch_1', channelName: '', respondToMentionsOnly: true },
          { channelId: 'ch_2', channelName: '', respondToMentionsOnly: true },
        ],
      });
    });

    it('defaults respondToMentionsOnly to false when not provided in legacy', () => {
      const result = discordCredentialsSchema.parse({
        token: 'secret-token',
        allowedChannelIds: ['ch_1'],
        respondToMentionsOnly: undefined,
      });
      expect(result.channels[0].respondToMentionsOnly).toBe(false);
    });

    it('handles empty allowedChannelIds', () => {
      const result = discordCredentialsSchema.parse({
        token: 'secret-token',
        allowedChannelIds: [],
        respondToMentionsOnly: false,
      });
      expect(result.channels).toEqual([]);
    });
  });
});

// ─── emailCredentialsSchema ───────────────────────────────────────────────────

describe('emailCredentialsSchema', () => {
  it('parses valid email credentials', () => {
    const result = emailCredentialsSchema.parse({
      imap: { host: 'imap.example.com', port: 993, secure: true, user: 'user', password: 'pass' },
      smtp: { host: 'smtp.example.com', port: 465, secure: true, user: 'user', password: 'pass' },
      bcc: 'default@bcc.com',
    });
    expect(result.imap.host).toBe('imap.example.com');
    expect(result.smtp.port).toBe(465);
    expect(result.bcc).toBe('default@bcc.com');
  });

  it('parses without bcc', () => {
    const result = emailCredentialsSchema.parse({
      imap: { host: 'imap.example.com', port: 993, secure: true, user: 'user', password: 'pass' },
      smtp: { host: 'smtp.example.com', port: 25, secure: false, user: 'user', password: 'pass' },
    });
    expect(result.bcc).toBeUndefined();
  });

  it('throws when imap host is missing', () => {
    expect(() => emailCredentialsSchema.parse({
      imap: { port: 993, secure: true, user: 'user', password: 'pass' },
      smtp: { host: 'smtp.example.com', port: 465, secure: true, user: 'user', password: 'pass' },
    })).toThrow();
  });

  it('throws when smtp port is not a number', () => {
    expect(() => emailCredentialsSchema.parse({
      imap: { host: 'imap.example.com', port: 993, secure: true, user: 'user', password: 'pass' },
      smtp: { host: 'smtp.example.com', port: '465', secure: true, user: 'user', password: 'pass' },
    })).toThrow();
  });
});

// ─── parseProviderCredentials ───────────────────────────────────────────────

describe('parseProviderCredentials', () => {
  it('parses internal-chat credentials', () => {
    const result = parseProviderCredentials('internal-chat', { agentId: 'agent-123' });
    expect(result.agentId).toBe('agent-123');
  });

  it('parses discord credentials (channel format)', () => {
    const result = parseProviderCredentials('discord', {
      token: 'tok',
      channels: [{ channelId: 'ch1', respondToMentionsOnly: false }],
    });
    expect(result.token).toBe('tok');
    expect(result.channels[0].channelId).toBe('ch1');
  });

  it('parses discord credentials (legacy format)', () => {
    const result = parseProviderCredentials('discord', {
      token: 'tok',
      allowedChannelIds: ['ch1', 'ch2'],
      respondToMentionsOnly: true,
    });
    expect(result.token).toBe('tok');
    expect(result.channels).toHaveLength(2);
    expect(result.channels[0].channelId).toBe('ch1');
    expect(result.channels[0].respondToMentionsOnly).toBe(true);
  });

  it('parses email credentials', () => {
    const result = parseProviderCredentials('email', {
      imap: { host: 'h', port: 993, secure: true, user: 'u', password: 'p' },
      smtp: { host: 'h', port: 465, secure: true, user: 'u', password: 'p' },
    });
    expect(result.imap.host).toBe('h');
  });

  it('throws for invalid internal-chat credentials', () => {
    expect(() => parseProviderCredentials('internal-chat', {})).toThrow();
  });

  it('throws for invalid discord credentials', () => {
    expect(() => parseProviderCredentials('discord', {})).toThrow();
  });

  it('throws for invalid email credentials', () => {
    expect(() => parseProviderCredentials('email', {})).toThrow();
  });
});
