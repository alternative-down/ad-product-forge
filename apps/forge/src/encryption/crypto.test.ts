import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { decryptSecret, encryptSecret } from './crypto';

describe('crypto', () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    vi.stubGlobal('forgeDebug', vi.fn());
    vi.resetModules();
  });

  afterEach(() => {
    process.env.ENCRYPTION_KEY = originalKey ?? '';
  });

  // ── missing key ─────────────────────────────────────────────────────────
  describe('when ENCRYPTION_KEY is absent', () => {
    it('encryptSecret throws with required message', async () => {
      process.env.ENCRYPTION_KEY = '';
      const { encryptSecret: fn } = await import('./crypto');
      expect(() => fn('hello')).toThrow('ENCRYPTION_KEY environment variable is required');
    });

    it('decryptSecret throws with required message', async () => {
      process.env.ENCRYPTION_KEY = '';
      const { decryptSecret: fn } = await import('./crypto');
      expect(() => fn('abc')).toThrow('ENCRYPTION_KEY environment variable is required');
    });
  });

  // ── invalid key length ───────────────────────────────────────────────────
  describe('when ENCRYPTION_KEY is not 32 bytes base64', () => {
    it('encryptSecret throws with generation hint', async () => {
      process.env.ENCRYPTION_KEY = Buffer.from('short').toString('base64');
      const { encryptSecret: fn } = await import('./crypto');
      expect(() => fn('hello')).toThrow('ENCRYPTION_KEY must be 256-bit (32 bytes)');
      expect(() => fn('hello')).toThrow('Generate with:');
    });

    it('decryptSecret throws with same error as encryptSecret', async () => {
      process.env.ENCRYPTION_KEY = Buffer.from('short').toString('base64');
      const { decryptSecret: fn } = await import('./crypto');
      expect(() => fn('abc')).toThrow('ENCRYPTION_KEY must be 256-bit (32 bytes)');
    });

    it('encryptSecret throws same message as decryptSecret for invalid key', async () => {
      process.env.ENCRYPTION_KEY = Buffer.from('too-long-key-that-exceeds-32-bytes').toString(
        'base64',
      );
      const { encryptSecret: enc, decryptSecret: dec } = await import('./crypto');
      let encMsg = '';
      let decMsg = '';
      try {
        enc('test');
      } catch (e: unknown) {
        encMsg = (e as Error).message;
      }
      vi.resetModules();
      process.env.ENCRYPTION_KEY = Buffer.from('too-long-key-that-exceeds-32-bytes').toString(
        'base64',
      );
      const { decryptSecret: dec2 } = await import('./crypto');
      try {
        dec2('test');
      } catch (e: unknown) {
        decMsg = (e as Error).message;
      }
      expect(encMsg).toBe(decMsg);
    });
  });

  // ── happy path ──────────────────────────────────────────────────────────
  describe('when ENCRYPTION_KEY is valid 32-byte base64', () => {
    const validKey = Buffer.from(crypto.randomBytes(32)).toString('base64');

    it('encryptSecret returns base64 string', async () => {
      process.env.ENCRYPTION_KEY = validKey;
      const { encryptSecret: fn } = await import('./crypto');
      const result = fn('my secret');
      expect(typeof result).toBe('string');
      expect(Buffer.from(result, 'base64').length).toBeGreaterThan(32);
    });

    it('encryptSecret is reversible via decryptSecret', async () => {
      process.env.ENCRYPTION_KEY = validKey;
      const { encryptSecret: enc, decryptSecret: dec } = await import('./crypto');
      const encrypted = enc('hello world');
      const decrypted = dec(encrypted);
      expect(decrypted).toBe('hello world');
    });

    it('produces different ciphertext each call (random IV)', async () => {
      process.env.ENCRYPTION_KEY = validKey;
      const { encryptSecret: fn } = await import('./crypto');
      const ct1 = fn('same plaintext');
      const ct2 = fn('same plaintext');
      expect(ct1).not.toBe(ct2);
    });

    it('round-trip works for empty string', async () => {
      process.env.ENCRYPTION_KEY = validKey;
      const { encryptSecret: enc, decryptSecret: dec } = await import('./crypto');
      expect(dec(enc(''))).toBe('');
    });

    it('round-trip works for unicode', async () => {
      process.env.ENCRYPTION_KEY = validKey;
      const { encryptSecret: enc, decryptSecret: dec } = await import('./crypto');
      expect(dec(enc('日本語テスト 🔐'))).toBe('日本語テスト 🔐');
    });

    it('round-trip works for long strings', async () => {
      process.env.ENCRYPTION_KEY = validKey;
      const { encryptSecret: enc, decryptSecret: dec } = await import('./crypto');
      const long = 'a'.repeat(10_000);
      expect(dec(enc(long))).toBe(long);
    });
  });

  // ── key drift (C1 tripwire gap from #5678) ──────────────────────────────
  // C1 scenario: env var value changes between encrypt and decrypt time.
  // Both keys are VALID 32-byte base64, so the key length check passes.
  // The tripwire must catch the GCM auth tag mismatch, not silently return ''.
  describe('decryptSecret on key drift (C1 tripwire)', () => {
    const keyA = Buffer.from(crypto.randomBytes(32)).toString('base64');
    const keyB = Buffer.from(crypto.randomBytes(32)).toString('base64');

    it('throws on GCM auth tag mismatch when key changes between encrypt and decrypt', async () => {
      // Encrypt with key A
      process.env.ENCRYPTION_KEY = keyA;
      const { encryptSecret: enc } = await import('./crypto');
      const ciphertext = enc('production-secret-payload');

      // Reload module with key B (valid 32-byte base64, different value).
      // vi.resetModules() is required between imports: without it, the second
      // await import('./crypto') returns the cached module whose module-level
      // ENCRYPTION_KEY const was set to keyA, so dec would happily decrypt
      // (false positive — the tripwire would silently pass).
      vi.resetModules();
      process.env.ENCRYPTION_KEY = keyB;
      const { decryptSecret: dec } = await import('./crypto');

      // Decrypt must throw — NOT return empty string (silent corruption would
      // cause profile/LLM settings to appear empty in production)
      expect(() => dec(ciphertext)).toThrow();

      // Confirm the throw produces a real error (not a swallowed rejection)
      let captured: unknown;
      try {
        dec(ciphertext);
      } catch (e: unknown) {
        captured = e;
      }
      expect(captured).toBeInstanceOf(Error);
    });

    it('round-trip succeeds when key is unchanged across module reload (positive control)', async () => {
      // Positive control: same key across module reload must still round-trip.
      // Proves the key-drift test above is not a false positive caused by
      // module-reload breaking valid decrypts.
      process.env.ENCRYPTION_KEY = keyA;
      const { encryptSecret: enc } = await import('./crypto');
      const ciphertext = enc('roundtrip-stable-key');

      // Re-import with same key. Same vi.resetModules() requirement as the
      // key-drift test — proves the resetModules pattern itself doesn't break
      // valid roundtrips (the test infrastructure is sound).
      vi.resetModules();
      process.env.ENCRYPTION_KEY = keyA;
      const { decryptSecret: dec } = await import('./crypto');
      expect(dec(ciphertext)).toBe('roundtrip-stable-key');
    });
  });

  // ── corrupt ciphertext ─────────────────────────────────────────────────
  describe('decryptSecret with corrupt input', () => {
    const validKey = Buffer.from(crypto.randomBytes(32)).toString('base64');

    it('throws on invalid base64', async () => {
      process.env.ENCRYPTION_KEY = validKey;
      const { decryptSecret: fn } = await import('./crypto');
      expect(() => fn('not-valid-base64!!!')).toThrow();
    });

    it('throws on tampered ciphertext (wrong tag)', async () => {
      process.env.ENCRYPTION_KEY = validKey;
      const { encryptSecret: enc, decryptSecret: dec } = await import('./crypto');
      const ct = Buffer.from(enc('test'));
      // Flip last byte to corrupt the auth tag
      ct[ct.length - 1] ^= 0xff;
      expect(() => decryptSecret(Buffer.from(ct).toString('base64'))).toThrow();
    });
  });
});
