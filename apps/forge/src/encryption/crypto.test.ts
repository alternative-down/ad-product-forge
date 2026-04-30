import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const TEST_KEY = Buffer.alloc(32).fill(0x42).toString('base64');
const SHORT_KEY = Buffer.alloc(16).toString('base64');

describe('encryptSecret + decryptSecret roundtrip', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });
  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
    vi.resetModules();
  });

  it('roundtrips short plaintext', async () => {
    const { encryptSecret, decryptSecret } = await import('./crypto.js');
    expect(decryptSecret(encryptSecret('hello'))).toBe('hello');
  });

  it('roundtrips unicode text', async () => {
    const { encryptSecret, decryptSecret } = await import('./crypto.js');
    expect(decryptSecret(encryptSecret('こんにちは 🌍 مرحبا'))).toBe('こんにちは 🌍 مرحبا');
  });

  it('roundtrips empty string', async () => {
    const { encryptSecret, decryptSecret } = await import('./crypto.js');
    expect(decryptSecret(encryptSecret(''))).toBe('');
  });

  it('roundtrips long text (10k chars)', async () => {
    const { encryptSecret, decryptSecret } = await import('./crypto.js');
    expect(decryptSecret(encryptSecret('A'.repeat(10_000)))).toBe('A'.repeat(10_000));
  });

  it('produces different ciphertext each call (random IV)', async () => {
    const { encryptSecret } = await import('./crypto.js');
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('returns a valid base64 string', async () => {
    const { encryptSecret } = await import('./crypto.js');
    const result = encryptSecret('test');
    expect(typeof result).toBe('string');
    expect(() => Buffer.from(result, 'base64')).not.toThrow();
  });
});

describe('encryptSecret', () => {
  it('throws when key is not 32 bytes', async () => {
    vi.resetModules();
    process.env.ENCRYPTION_KEY = SHORT_KEY;
    const { encryptSecret } = await import('./crypto.js');
    expect(() => encryptSecret('hello')).toThrow('256-bit');
    delete process.env.ENCRYPTION_KEY;
    vi.resetModules();
  });

  it('throws when ENCRYPTION_KEY is missing', async () => {
    vi.resetModules();
    delete process.env.ENCRYPTION_KEY;
    const { encryptSecret } = await import('./crypto.js');
    expect(() => encryptSecret('hello')).toThrow('ENCRYPTION_KEY');
    process.env.ENCRYPTION_KEY = TEST_KEY;
    vi.resetModules();
  });
});

describe('decryptSecret', () => {
  it('throws when key is not 32 bytes', async () => {
    vi.resetModules();
    process.env.ENCRYPTION_KEY = SHORT_KEY;
    const { decryptSecret } = await import('./crypto.js');
    expect(() => decryptSecret('abc')).toThrow('256-bit');
    process.env.ENCRYPTION_KEY = TEST_KEY;
    vi.resetModules();
  });

  it('throws when ciphertext is tampered (auth tag mismatch)', async () => {
    vi.resetModules();
    process.env.ENCRYPTION_KEY = TEST_KEY;
    const { encryptSecret, decryptSecret } = await import('./crypto.js');
    const encrypted = encryptSecret('secret');
    // Replace last 2 chars — corrupts auth tag
    const tampered = encrypted.slice(0, -2) + 'XX';
    expect(() => decryptSecret(tampered)).toThrow();
    vi.resetModules();
  });

  it('throws when ENCRYPTION_KEY is missing', async () => {
    vi.resetModules();
    delete process.env.ENCRYPTION_KEY;
    const { decryptSecret } = await import('./crypto.js');
    expect(() => decryptSecret('abc')).toThrow('ENCRYPTION_KEY');
    process.env.ENCRYPTION_KEY = TEST_KEY;
    vi.resetModules();
  });
});
