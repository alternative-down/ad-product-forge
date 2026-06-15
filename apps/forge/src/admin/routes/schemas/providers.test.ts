/**
 * Unit tests for admin/routes/schemas/providers.ts.
 * Zod validation schemas for agent provider and system integration management.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import { upsertSystemIntegrationSchema, deleteSystemIntegrationSchema } from './providers';

// ─── upsertSystemIntegrationSchema — migadu provider ───────────────────────

describe('upsertSystemIntegrationSchema — migadu provider', () => {
  it('parses minimal valid migadu input', () => {
    const result = upsertSystemIntegrationSchema.parse({
      providerType: 'migadu',
      config: { apiUser: 'user@example.com', apiKey: 'secret-key-123' },
    });
    expect(result.providerType).toBe('migadu');
    expect((result.config as any).apiUser).toBe('user@example.com');
  });

  it('parses with isEnabled', () => {
    const result = upsertSystemIntegrationSchema.parse({
      providerType: 'migadu',
      isEnabled: false,
      config: { apiUser: 'u@e.com', apiKey: 'k' },
    });
    expect(result.isEnabled).toBe(false);
  });

  it('rejects invalid email for apiUser', () => {
    expect(() =>
      upsertSystemIntegrationSchema.parse({
        providerType: 'migadu',
        config: { apiUser: 'not-email', apiKey: 'k' },
      }),
    ).toThrow();
  });

  it('rejects empty apiKey', () => {
    expect(() =>
      upsertSystemIntegrationSchema.parse({
        providerType: 'migadu',
        config: { apiUser: 'u@e.com', apiKey: '' },
      }),
    ).toThrow();
  });
});

// ─── upsertSystemIntegrationSchema — coolify provider ───────────────────────

describe('upsertSystemIntegrationSchema — coolify provider', () => {
  it('parses minimal valid coolify input', () => {
    const result = upsertSystemIntegrationSchema.parse({
      providerType: 'coolify',
      config: {
        baseUrl: 'https://coolify.example.com',
        adminToken: 'token-abc',
        serverId: 'srv-1',
        destinationId: 'dest-1',
      },
    });
    expect(result.providerType).toBe('coolify');
    expect((result.config as any).serverId).toBe('srv-1');
  });

  it('parses with optional applicationsBaseDomain', () => {
    const result = upsertSystemIntegrationSchema.parse({
      providerType: 'coolify',
      isEnabled: true,
      config: {
        baseUrl: 'https://c.io',
        adminToken: 't',
        serverId: 's',
        destinationId: 'd',
        applicationsBaseDomain: 'app.example.com',
      },
    });
    expect((result.config as any).applicationsBaseDomain).toBe('app.example.com');
  });

  it('rejects invalid baseUrl', () => {
    expect(() =>
      upsertSystemIntegrationSchema.parse({
        providerType: 'coolify',
        config: { baseUrl: 'not-url', adminToken: 't', serverId: 's', destinationId: 'd' },
      }),
    ).toThrow();
  });

  it('rejects empty adminToken', () => {
    expect(() =>
      upsertSystemIntegrationSchema.parse({
        providerType: 'coolify',
        config: { baseUrl: 'https://c.io', adminToken: '', serverId: 's', destinationId: 'd' },
      }),
    ).toThrow();
  });

  it('rejects empty serverId', () => {
    expect(() =>
      upsertSystemIntegrationSchema.parse({
        providerType: 'coolify',
        config: { baseUrl: 'https://c.io', adminToken: 't', serverId: '', destinationId: 'd' },
      }),
    ).toThrow();
  });
});

// ─── upsertSystemIntegrationSchema — github provider ───────────────────────

describe('upsertSystemIntegrationSchema — github provider', () => {
  it('parses minimal valid github input', () => {
    const result = upsertSystemIntegrationSchema.parse({
      providerType: 'github',
      config: {
        organization: 'my-org',
        appHomeUrl: 'https://github.com/apps/my-app',
      },
    });
    expect(result.providerType).toBe('github');
    expect((result.config as any).organization).toBe('my-org');
  });

  it('rejects invalid appHomeUrl', () => {
    expect(() =>
      upsertSystemIntegrationSchema.parse({
        providerType: 'github',
        config: { organization: 'org', appHomeUrl: 'not-a-url' },
      }),
    ).toThrow();
  });

  it('rejects empty organization', () => {
    expect(() =>
      upsertSystemIntegrationSchema.parse({
        providerType: 'github',
        config: { organization: '', appHomeUrl: 'https://github.com/a' },
      }),
    ).toThrow();
  });
});

// ─── upsertSystemIntegrationSchema — minimax provider ──────────────────────

describe('upsertSystemIntegrationSchema — minimax provider', () => {
  it('parses minimal valid minimax input', () => {
    const result = upsertSystemIntegrationSchema.parse({
      providerType: 'minimax',
      config: { apiKey: 'minimax-api-key-123' },
    });
    expect(result.providerType).toBe('minimax');
    expect((result.config as any).apiKey).toBe('minimax-api-key-123');
  });

  it('rejects empty apiKey', () => {
    expect(() =>
      upsertSystemIntegrationSchema.parse({
        providerType: 'minimax',
        config: { apiKey: '' },
      }),
    ).toThrow();
  });
});

// ─── upsertSystemIntegrationSchema — invalid provider ────────────────────

describe('upsertSystemIntegrationSchema — invalid provider', () => {
  it('rejects unknown providerType', () => {
    expect(() =>
      upsertSystemIntegrationSchema.parse({
        providerType: 'unknown-provider',
        config: {},
      }),
    ).toThrow();
  });

  it('rejects missing providerType', () => {
    expect(() => upsertSystemIntegrationSchema.parse({ config: {} })).toThrow();
  });

  it('rejects wrong config shape for provider', () => {
    expect(() =>
      upsertSystemIntegrationSchema.parse({
        providerType: 'migadu',
        config: { apiKey: 'k' },
      }),
    ).toThrow();
  });
});

// ─── deleteSystemIntegrationSchema ────────────────────────────────────────

describe('deleteSystemIntegrationSchema', () => {
  it('parses valid input', () => {
    expect(deleteSystemIntegrationSchema.parse({ providerType: 'migadu', integrationId: 'int-1' })).toMatchObject({
      providerType: 'migadu',
    });
  });

  it('parses valid input for coolify', () => {
    expect(deleteSystemIntegrationSchema.parse({ providerType: 'coolify', integrationId: 'int-1' })).toMatchObject({
      providerType: 'coolify',
    });
  });

  it('rejects unknown providerType', () => {
    expect(() => deleteSystemIntegrationSchema.parse({ providerType: 'slack' })).toThrow();
  });

  it('rejects missing providerType', () => {
    expect(() => deleteSystemIntegrationSchema.parse({})).toThrow();
  });
});

// ─── safeParse (non-throwing) ─────────────────────────────────────────────

describe('schema.safeParse', () => {
  it('upsertSystemIntegrationSchema safeParse returns success false for missing apiUser', () => {
    const result = upsertSystemIntegrationSchema.safeParse({
      providerType: 'migadu',
      config: { apiKey: 'k' },
    });
    expect(result.success).toBe(false);
  });

  it('upsertSystemIntegrationSchema safeParse returns success true for valid migadu', () => {
    const result = upsertSystemIntegrationSchema.safeParse({
      providerType: 'migadu',
      config: { apiUser: 'u@e.com', apiKey: 'k' },
    });
    expect(result.success).toBe(true);
  });

  it('upsertSystemIntegrationSchema safeParse returns success true for valid coolify', () => {
    const result = upsertSystemIntegrationSchema.safeParse({
      providerType: 'coolify',
      config: { baseUrl: 'https://c.io', adminToken: 't', serverId: 's', destinationId: 'd' },
    });
    expect(result.success).toBe(true);
  });

  it('deleteSystemIntegrationSchema safeParse returns success false for unknown provider', () => {
    const result = deleteSystemIntegrationSchema.safeParse({ providerType: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('deleteSystemIntegrationSchema safeParse returns success true for valid github', () => {
    const result = deleteSystemIntegrationSchema.safeParse({ providerType: 'github', integrationId: 'int-1' });
    expect(result.success).toBe(true);
  });
});
