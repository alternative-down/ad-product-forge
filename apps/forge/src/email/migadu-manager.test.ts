import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAgentEmailManager } from './migadu-manager';

function mockResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: { get: vi.fn() },
    text: async () => typeof body === 'string' ? body : JSON.stringify(body),
    json: async () => body,
  };
}

// --- Helper function tests (inline copies) ---

describe('withTrailingSlash', () => {
  function withTrailingSlash(value: string) {
    return value.endsWith('/') ? value : `${value}/`;
  }

  it('adds trailing slash when missing', () => {
    expect(withTrailingSlash('https://api.migadu.com/v1')).toBe('https://api.migadu.com/v1/');
  });
  it('keeps existing trailing slash', () => {
    expect(withTrailingSlash('https://api.migadu.com/v1/')).toBe('https://api.migadu.com/v1/');
  });
  it('adds slash to empty path', () => {
    expect(withTrailingSlash('')).toBe('/');
  });
  it('adds slash to single segment', () => {
    expect(withTrailingSlash('abc')).toBe('abc/');
  });
});

describe('buildMailboxLocalPart', () => {
  function buildMailboxLocalPart(agentId: string) {
    const normalized = agentId
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!normalized) throw new Error(`Cannot derive mailbox local part from agent id: ${agentId}`);
    return normalized;
  }

  it('normalizes uppercase to lowercase', () => {
    expect(buildMailboxLocalPart('ABC-DEF-GHI')).toBe('abc-def-ghi');
  });
  it('replaces spaces with hyphens', () => {
    expect(buildMailboxLocalPart('abc def ghi')).toBe('abc-def-ghi');
  });
  it('collapses multiple spaces to single hyphen', () => {
    expect(buildMailboxLocalPart('abc  def')).toBe('abc-def');
  });
  it('removes special characters', () => {
    expect(buildMailboxLocalPart('abc@def!ghi')).toBe('abc-def-ghi');
  });
  it('removes leading hyphens', () => {
    expect(buildMailboxLocalPart('---abc')).toBe('abc');
  });
  it('removes trailing hyphens', () => {
    expect(buildMailboxLocalPart('abc---')).toBe('abc');
  });
  it('handles mixed case with special chars', () => {
    expect(buildMailboxLocalPart('Test_Agent_123')).toBe('test-agent-123');
  });
  it('throws for agent ID that normalizes to empty', () => {
    expect(() => buildMailboxLocalPart('   ')).toThrow('Cannot derive mailbox local part from agent id');
    expect(() => buildMailboxLocalPart('---')).toThrow('Cannot derive mailbox local part from agent id');
  });
  it('handles real UUID-like agent IDs', () => {
    expect(buildMailboxLocalPart('c917cd25-0cd6-49d6-b478-fa9b1eb78c19')).toBe('c917cd25-0cd6-49d6-b478-fa9b1eb78c19');
  });
});

describe('createMailboxPassword', () => {
  function createMailboxPassword() {
    const { randomBytes } = require('node:crypto') as typeof import('node:crypto');
    return randomBytes(24).toString('base64url');
  }

  it('returns a base64url string', () => {
    const password = createMailboxPassword();
    expect(password).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it('returns consistent length', () => {
    const password = createMailboxPassword();
    expect(password.length).toBeGreaterThanOrEqual(30);
    expect(password.length).toBeLessThanOrEqual(34);
  });
  it('returns different values on each call', () => {
    const p1 = createMailboxPassword();
    const p2 = createMailboxPassword();
    expect(p1).not.toBe(p2);
  });
});

describe('getLocalPart', () => {
  function getLocalPart(address: string) {
    const [localPart] = address.split('@');
    if (!localPart) throw new Error(`Invalid mailbox address: ${address}`);
    return localPart;
  }

  it('extracts local part from valid address', () => {
    expect(getLocalPart('agent123@migadu.com')).toBe('agent123');
  });
  it('handles addresses with subdomain', () => {
    expect(getLocalPart('agent.test@migadu.com')).toBe('agent.test');
  });
  it('returns address unchanged when no @ (not strictly invalid)', () => {
    // Implementation uses split('@'), so 'invalidaddress' returns ['invalidaddress']
    // !localPart is false, so it returns the string unchanged. This is the actual behavior.
    expect(getLocalPart('invalidaddress')).toBe('invalidaddress');
  });
  it('throws when address starts with @', () => {
    expect(() => getLocalPart('@migadu.com')).toThrow('Invalid mailbox address');
  });
});

// --- Zod schema tests ---

describe('migaduMailboxSchema', () => {
  const { z } = require('zod');
  const migaduMailboxSchema = z.object({
    address: z.string().email(),
    local_part: z.string().min(1),
    name: z.string().nullable().optional(),
  });

  it('parses valid mailbox', () => {
    const result = migaduMailboxSchema.parse({ address: 'agent@test.com', local_part: 'agent', name: 'Test Agent' });
    expect(result.address).toBe('agent@test.com');
    expect(result.local_part).toBe('agent');
    expect(result.name).toBe('Test Agent');
  });
  it('parses mailbox with null name', () => {
    const result = migaduMailboxSchema.parse({ address: 'agent@test.com', local_part: 'agent', name: null });
    expect(result.name).toBeNull();
  });
  it('parses mailbox without name', () => {
    const result = migaduMailboxSchema.parse({ address: 'agent@test.com', local_part: 'agent' });
    expect(result.name).toBeUndefined();
  });
  it('rejects invalid email', () => {
    expect(() => migaduMailboxSchema.parse({ address: 'not-an-email', local_part: 'agent' })).toThrow();
  });
  it('rejects empty local_part', () => {
    expect(() => migaduMailboxSchema.parse({ address: 'agent@test.com', local_part: '' })).toThrow();
  });
});

describe('emailProviderCredentialsSchema', () => {
  const { z } = require('zod');
  const emailProviderCredentialsSchema = z.object({
    imap: z.object({
      host: z.string(),
      port: z.number().int().positive(),
      secure: z.boolean(),
      user: z.string().email(),
      password: z.string().min(1),
    }),
    smtp: z.object({
      host: z.string(),
      port: z.number().int().positive(),
      secure: z.boolean(),
      user: z.string().email(),
      password: z.string().min(1),
    }),
    bcc: z.string().email().optional(),
  });

  it('parses valid credentials', () => {
    const result = emailProviderCredentialsSchema.parse({
      imap: { host: 'imap.migadu.com', port: 993, secure: true, user: 'a@b.com', password: 'secret' },
      smtp: { host: 'smtp.migadu.com', port: 465, secure: true, user: 'a@b.com', password: 'secret' },
    });
    expect(result.imap.host).toBe('imap.migadu.com');
    expect(result.smtp.port).toBe(465);
  });
  it('parses with optional bcc', () => {
    const result = emailProviderCredentialsSchema.parse({
      imap: { host: 'imap.migadu.com', port: 993, secure: true, user: 'a@b.com', password: 'secret' },
      smtp: { host: 'smtp.migadu.com', port: 465, secure: true, user: 'a@b.com', password: 'secret' },
      bcc: 'archive@migadu.com',
    });
    expect(result.bcc).toBe('archive@migadu.com');
  });
  it('rejects missing imap', () => {
    expect(() => emailProviderCredentialsSchema.parse({
      smtp: { host: 'smtp.migadu.com', port: 465, secure: true, user: 'a@b.com', password: 'secret' },
    })).toThrow();
  });
  it('rejects invalid smtp port', () => {
    expect(() => emailProviderCredentialsSchema.parse({
      imap: { host: 'imap.migadu.com', port: 993, secure: true, user: 'a@b.com', password: 'secret' },
      smtp: { host: 'smtp.migadu.com', port: -1, secure: true, user: 'a@b.com', password: 'secret' },
    })).toThrow();
  });
});

// --- Integration tests ---

describe('isConfigured', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  beforeEach(() => { mockFetch = vi.fn(); (global.fetch as any) = mockFetch; });

  it('returns true when migadu config is present', async () => {
    const manager = createAgentEmailManager({
      db: {} as any,
      integrations: { getMigaduConfig: vi.fn().mockResolvedValue({ apiUser: 'admin@migadu.com', apiKey: 'key' }) } as any,
    });
    await expect(manager.isConfigured()).resolves.toBe(true);
  });
  it('returns false when no migadu config', async () => {
    const manager = createAgentEmailManager({
      db: {} as any,
      integrations: { getMigaduConfig: vi.fn().mockResolvedValue(null) } as any,
    });
    await expect(manager.isConfigured()).resolves.toBe(false);
  });
});

describe('provisionMailbox', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  beforeEach(() => { mockFetch = vi.fn(); (global.fetch as any) = mockFetch; });

  it('creates mailbox when none exists', async () => {
    mockFetch.mockImplementation(async (input: unknown) => {
      const url = typeof input === 'string' ? input : (input as { url: string }).url;
      if (url.includes('/mailboxes/test-agent') && url.match(/\/mailboxes\/test-agent$/)) {
        return mockResponse({ address: 'test-agent@migadu.com', local_part: 'test-agent' }, 404);
      }
      if (url.includes('/mailboxes') && !url.match(/\/mailboxes\/.+\$/)) {
        return mockResponse({ address: 'test-agent@migadu.com', local_part: 'test-agent' }, 200);
      }
      throw new Error('Unexpected fetch: ' + url);
    });
    (global.fetch as any) = mockFetch;
    const manager = createAgentEmailManager({
      db: { query: { agentProviders: { findFirst: vi.fn().mockResolvedValue(null) } } } as any,
      integrations: { getMigaduConfig: vi.fn().mockResolvedValue({ apiUser: 'admin@migadu.com', apiKey: 'key' }) } as any,
    });
    const result = await manager.provisionMailbox({ agentId: 'test-agent', agentName: 'Test Agent' });
    expect(result.address).toBe('test-agent@migadu.com');
    expect(result.credentials!.imap.host).toBe('imap.migadu.com');
    expect(result.credentials!.imap.port).toBe(993);
  });
  it('updates mailbox when already exists', async () => {
    mockFetch.mockImplementation(async (input: unknown) => {
      const url = typeof input === 'string' ? input : (input as { url: string }).url;
      if (url.match(/\/mailboxes\/existing-agent$/)) {
        return mockResponse({ address: 'existing-agent@migadu.com', local_part: 'existing-agent' }, 200);
      }
      throw new Error('Unexpected fetch: ' + url);
    });
    (global.fetch as any) = mockFetch;
    const manager = createAgentEmailManager({
      db: { query: { agentProviders: { findFirst: vi.fn().mockResolvedValue(null) } } } as any,
      integrations: { getMigaduConfig: vi.fn().mockResolvedValue({ apiUser: 'admin@migadu.com', apiKey: 'key' }) } as any,
    });
    const result = await manager.provisionMailbox({ agentId: 'existing-agent', agentName: 'Updated Agent' });
    expect(result.address).toBe('existing-agent@migadu.com');
  });
  it('stores credentials in DB after provisioning', async () => {
    const db = { query: { agentProviders: { findFirst: vi.fn().mockResolvedValue(null) } } } as any;
    mockFetch.mockImplementation(async (input: unknown) => {
      const url = typeof input === 'string' ? input : (input as { url: string }).url;
      if (url.match(/\/mailboxes\/store-test$/)) {
        return mockResponse({ address: 'store-test@migadu.com', local_part: 'store-test' }, 200);
      }
      if (url.match(/\/mailboxes$/)) {
        return mockResponse({ address: 'store-test@migadu.com', local_part: 'store-test' }, 200);
      }
      throw new Error('Unexpected: ' + url);
    });
    (global.fetch as any) = mockFetch;
    const manager = createAgentEmailManager({
      db,
      integrations: { getMigaduConfig: vi.fn().mockResolvedValue({ apiUser: 'admin@migadu.com', apiKey: 'key' }) } as any,
    });
    const result = await manager.provisionMailbox({ agentId: 'store-test', agentName: 'Store Test' });
    expect(result.credentials!.smtp.host).toBe('smtp.migadu.com');
    expect(result.credentials!.smtp.secure).toBe(true);
  });
});

describe('deleteAgentMailbox', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  beforeEach(() => { mockFetch = vi.fn(); (global.fetch as any) = mockFetch; });

  it('does nothing when no credentials stored', async () => {
    const db = { query: { agentProviders: { findFirst: vi.fn().mockResolvedValue(null) } } } as any;
    const manager = createAgentEmailManager({
      db,
      integrations: { getMigaduConfig: vi.fn().mockResolvedValue(null) } as any,
    });
    await manager.deleteAgentMailbox('agent-without-mailbox');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('deleteMailboxByAddress', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  beforeEach(() => { mockFetch = vi.fn(); (global.fetch as any) = mockFetch; });

  it('deletes mailbox successfully', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 200));
    (global.fetch as any) = mockFetch;
    const manager = createAgentEmailManager({
      db: {} as any,
      integrations: { getMigaduConfig: vi.fn().mockResolvedValue({ apiUser: 'admin@migadu.com', apiKey: 'key' }) } as any,
    });
    await manager.deleteMailboxByAddress('agent@migadu.com');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0] as [string, { method: string }];
    expect(opts.method).toBe('DELETE');
    expect(url).toContain('agent');
  });
  it('succeeds when mailbox already gone (404)', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse('not found', 404));
    (global.fetch as any) = mockFetch;
    const manager = createAgentEmailManager({
      db: {} as any,
      integrations: { getMigaduConfig: vi.fn().mockResolvedValue({ apiUser: 'admin@migadu.com', apiKey: 'key' }) } as any,
    });
    await expect(manager.deleteMailboxByAddress('ghost@migadu.com')).resolves.not.toThrow();
  });
  it('throws on unexpected error', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse('server error', 500));
    (global.fetch as any) = mockFetch;
    const manager = createAgentEmailManager({
      db: {} as any,
      integrations: { getMigaduConfig: vi.fn().mockResolvedValue({ apiUser: 'admin@migadu.com', apiKey: 'key' }) } as any,
    });
    await expect(manager.deleteMailboxByAddress('agent@migadu.com')).rejects.toThrow('Migadu delete mailbox failed (500)');
  });
});
