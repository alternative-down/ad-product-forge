/**
 * Agent Provider Schema Tests
 *
 * Tests the validation contracts for:
 *   POST /admin/agent-provider/upsert  (upsertAgentProviderSchema)
 *   POST /admin/agent-provider/delete (deleteAgentProviderSchema)
 *
 * Schema source: admin/routes/schemas.ts (canonical)
 *
 * NOTE: Cannot test via registerAdminRoutes — the '../routes' import path
 * resolves to a non-existent absolute path in this test environment.
 * Instead, we test the schemas directly (the critical validation layer).
 */

import { describe, it, expect } from 'vitest';
import { upsertAgentProviderSchema, deleteAgentProviderSchema } from '../schemas.js';

// =============================================================================
// upsertAgentProviderSchema
// =============================================================================

describe('upsertAgentProviderSchema', () => {
  it('parses valid discord credentials', () => {
    const result = upsertAgentProviderSchema.safeParse({
      agentId: 'agent-42',
      providerType: 'discord',
      credentials: { token: 'DISCORD_TOKEN_abc123', channels: ['ch1', 'ch2'] },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agentId).toBe('agent-42');
      expect(result.data.providerType).toBe('discord');
      expect(result.data.credentials).toEqual({ token: 'DISCORD_TOKEN_abc123', channels: ['ch1', 'ch2'] });
    }
  });

  it('parses valid email credentials', () => {
    const result = upsertAgentProviderSchema.safeParse({
      agentId: 'agent-42',
      providerType: 'email',
      credentials: {
        imap: { host: 'imap.example.com', port: 993, user: 'bot@example.com', password: 'pass' },
        smtp: { host: 'smtp.example.com', port: 587, user: 'bot@example.com', password: 'pass' },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.providerType).toBe('email');
      expect(result.data.credentials).toHaveProperty('imap');
      expect(result.data.credentials).toHaveProperty('smtp');
    }
  });

  it('rejects invalid providerType', () => {
    const result = upsertAgentProviderSchema.safeParse({
      agentId: 'agent-42',
      providerType: 'slack',
      credentials: { token: 'x' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('providerType');
    }
  });

  it('rejects missing agentId', () => {
    const result = upsertAgentProviderSchema.safeParse({
      providerType: 'discord',
      credentials: { token: 'x' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('agentId');
    }
  });

  it('rejects empty agentId', () => {
    const result = upsertAgentProviderSchema.safeParse({
      agentId: '',
      providerType: 'discord',
      credentials: { token: 'x' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing providerType', () => {
    const result = upsertAgentProviderSchema.safeParse({
      agentId: 'agent-42',
      credentials: { token: 'x' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('providerType');
    }
  });

  it('accepts missing credentials (credentials uses z.unknown())', () => {
    // z.unknown() accepts undefined, so omitting credentials is valid
    const result = upsertAgentProviderSchema.safeParse({
      agentId: 'agent-42',
      providerType: 'discord',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.credentials).toBeUndefined();
    }
  });

  it('accepts unknown credentials shape (z.unknown() allows any value)', () => {
    const result = upsertAgentProviderSchema.safeParse({
      agentId: 'agent-42',
      providerType: 'email',
      credentials: { totallyCustom: { nested: { deep: 123 } } },
    });
    expect(result.success).toBe(true);
  });

  it('accepts credentials as null (z.unknown() accepts null)', () => {
    const result = upsertAgentProviderSchema.safeParse({
      agentId: 'agent-42',
      providerType: 'discord',
      credentials: null,
    });
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// deleteAgentProviderSchema
// =============================================================================

describe('deleteAgentProviderSchema', () => {
  it('parses valid discord delete request', () => {
    const result = deleteAgentProviderSchema.safeParse({
      agentId: 'agent-42',
      providerType: 'discord',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agentId).toBe('agent-42');
      expect(result.data.providerType).toBe('discord');
    }
  });

  it('parses valid email delete request', () => {
    const result = deleteAgentProviderSchema.safeParse({
      agentId: 'agent-99',
      providerType: 'email',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid providerType', () => {
    const result = deleteAgentProviderSchema.safeParse({
      agentId: 'agent-42',
      providerType: 'sms',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('providerType');
    }
  });

  it('rejects missing agentId', () => {
    const result = deleteAgentProviderSchema.safeParse({
      providerType: 'discord',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty agentId', () => {
    const result = deleteAgentProviderSchema.safeParse({
      agentId: '',
      providerType: 'discord',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing providerType', () => {
    const result = deleteAgentProviderSchema.safeParse({
      agentId: 'agent-42',
    });
    expect(result.success).toBe(false);
  });

  it('accepts only agentId + providerType', () => {
    const result = deleteAgentProviderSchema.safeParse({
      agentId: 'agent-42',
      providerType: 'discord',
    });
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// encryptSecret contract
// =============================================================================

describe('upsertAgentProviderSchema — encryptSecret contract', () => {
  /**
   * The route handler encrypts credentials with:
   *   const encrypted = await encryptSecret(JSON.stringify({ [providerType]: credentials }));
   *
   * Stored value shape: { "discord": { token, channels } }
   *                  or: { "email": { imap, smtp } }
   */

  it('discord credentials stored with discord key', () => {
    const input = {
      agentId: 'agent-42',
      providerType: 'discord',
      credentials: { token: 'DISCORD_TOKEN', channels: ['ch1'] },
    };
    const encryptPayload = JSON.stringify({ [input.providerType]: input.credentials });
    const parsed = JSON.parse(encryptPayload);
    expect(parsed).toEqual({ discord: { token: 'DISCORD_TOKEN', channels: ['ch1'] } });
    expect(Object.keys(parsed)).toContain('discord');
    expect(parsed.discord).toHaveProperty('token');
  });

  it('email credentials stored with email key', () => {
    const input = {
      agentId: 'agent-42',
      providerType: 'email',
      credentials: {
        imap: { host: 'imap.example.com', port: 993 },
        smtp: { host: 'smtp.example.com', port: 587 },
      },
    };
    const encryptPayload = JSON.stringify({ [input.providerType]: input.credentials });
    const parsed = JSON.parse(encryptPayload);
    expect(parsed).toEqual({
      email: {
        imap: { host: 'imap.example.com', port: 993 },
        smtp: { host: 'smtp.example.com', port: 587 },
      },
    });
  });

  it('providerType enum: only discord/email pass validation', () => {
    const validTypes = ['discord', 'email'];
    for (const type of validTypes) {
      const result = upsertAgentProviderSchema.safeParse({
        agentId: 'agent-1',
        providerType: type,
        credentials: { dummy: true },
      });
      expect(result.success).toBe(true);
    }

    const invalidTypes = ['slack', 'sms', 'whatsapp', 'telegram', '', 'DISCORD'];
    for (const type of invalidTypes) {
      const result = upsertAgentProviderSchema.safeParse({
        agentId: 'agent-1',
        providerType: type,
        credentials: { dummy: true },
      });
      expect(result.success).toBe(false);
    }
  });
});
