/**
 * Agent Provider Schema Tests
 *
 * Tests the validation contracts for:
 *   POST /admin/agent-provider/upsert  (upsertAgentProviderSchema)
 *   POST /admin/agent-provider/delete (deleteAgentProviderSchema)
 *
 * Schema source: admin/schemas.ts (canonical)
 */

import { describe, it, expect } from 'vitest';
import { upsertAgentProviderSchema, deleteAgentProviderSchema } from '../../schemas';

// =============================================================================
// upsertAgentProviderSchema
// =============================================================================

describe('upsertAgentProviderSchema', () => {
  it('accepts flat string credentials', () => {
    const result = upsertAgentProviderSchema.safeParse({
      agentId: 'agent-42',
      providerType: 'discord',
      credentials: { token: 'DISCORD_TOKEN_abc123' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agentId).toBe('agent-42');
      expect(result.data.providerType).toBe('discord');
      expect(result.data.credentials).toEqual({ token: 'DISCORD_TOKEN_abc123' });
    }
  });

  it('accepts empty credentials', () => {
    const result = upsertAgentProviderSchema.safeParse({
      agentId: 'agent-42',
      providerType: 'email',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.providerType).toBe('email');
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

  it('accepts credentials with extra unknown keys', () => {
    const result = upsertAgentProviderSchema.safeParse({
      agentId: 'agent-42',
      providerType: 'discord',
      credentials: { botToken: '12345:ABC', extraField: 'ignored' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.credentials).toHaveProperty('botToken');
    }
  });

  it('rejects non-string credential values', () => {
    const result = upsertAgentProviderSchema.safeParse({
      agentId: 'agent-42',
      providerType: 'discord',
      credentials: { token: 'bot123', active: true },
    });
    expect(result.success).toBe(false);
  });

  it('rejects array credential values', () => {
    const result = upsertAgentProviderSchema.safeParse({
      agentId: 'agent-42',
      providerType: 'discord',
      credentials: { channels: ['ch1', 'ch2'] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects nested object credential values', () => {
    const result = upsertAgentProviderSchema.safeParse({
      agentId: 'agent-42',
      providerType: 'email',
      credentials: { imap: { host: 'localhost' } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects credentials as null', () => {
    const result = upsertAgentProviderSchema.safeParse({
      agentId: 'agent-42',
      providerType: 'discord',
      credentials: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects credentials as number', () => {
    const result = upsertAgentProviderSchema.safeParse({
      agentId: 'agent-42',
      providerType: 'discord',
      credentials: 42,
    });
    expect(result.success).toBe(false);
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
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('agentId');
    }
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
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('providerType');
    }
  });
});
