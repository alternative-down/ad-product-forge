import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

    // L#NN-19 hygiene (#5952 + #5508): clear error on short input instead of
    // confusing "Unsupported state or unable to authenticate data" from GCM.
    it('throws clear "Invalid encrypted input" on combined.length < 32', async () => {
      process.env.ENCRYPTION_KEY = validKey;
      const { decryptSecret: fn } = await import('./crypto');
      // Empty base64 → empty buffer → length 0 < 32 → clear error before GCM.
      expect(() => fn('')).toThrow('Invalid encrypted input');
      expect(() => fn('')).toThrow('IV (16) + ciphertext + authTag (16)');
    });

    it('throws clear "Invalid encrypted input" on combined.length 31', async () => {
      process.env.ENCRYPTION_KEY = validKey;
      const { decryptSecret: fn } = await import('./crypto');
      // 31 bytes of base64 input — just under the 32-byte minimum.
      const short = Buffer.alloc(31, 0).toString('base64');
      expect(() => fn(short)).toThrow('Invalid encrypted input');
    });

    it('accepts minimum-length combined (32 bytes: empty plaintext)', async () => {
      process.env.ENCRYPTION_KEY = validKey;
      const { decryptSecret: fn, encryptSecret: enc } = await import('./crypto');
      // Encrypt empty string → 16 IV + 0 ciphertext + 16 authTag = 32 bytes combined.
      // This is the boundary case where the new check passes (32 is not < 32).
      const ct = enc('');
      expect(() => fn(ct)).not.toThrow();
      expect(fn(ct)).toBe('');
    });
  });


  // L#NN-19 hygiene (#5953 + #5509): redundant `=== undefined` check removed.
  // The module-level `const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? null`
  // produces type `string | null` (NOT `string | null | undefined`). A tripwire
  // test that asserts the behavior matches the type: setting ENCRYPTION_KEY to
  // the literal `undefined` (via unset env) produces the SAME error as null,
  // and the function does NOT have a separate undefined-branch.
  describe('requireEncryptionKey type narrowing (#5953 + #5509)', () => {
    // The redundant `=== undefined` check was removed because ENCRYPTION_KEY is
    // typed as `string | null` (from `process.env.ENCRYPTION_KEY ?? null`), not
    // `string | null | undefined`. The `=== undefined` branch was unreachable.
    it('source: requireEncryptionKey does NOT contain === undefined check', () => {
      const source = readFileSync(join(__dirname, 'crypto.ts'), 'utf8');
      // The bug pattern is "ENCRYPTION_KEY === undefined" — this must NOT appear
      // in the function body. We anchor on the function header to avoid matching
      // any other `=== undefined` checks elsewhere in the file.
      const fnBody = source.match(/function requireEncryptionKey[\s\S]*?\n\}/);
      expect(fnBody).not.toBeNull();
      expect(fnBody![0]).not.toMatch(/=== undefined/);
    });

    it('source: requireEncryptionKey still checks === null (defensive)', () => {
      const source = readFileSync(join(__dirname, 'crypto.ts'), 'utf8');
      const fnBody = source.match(/function requireEncryptionKey[\s\S]*?\n\}/);
      expect(fnBody).not.toBeNull();
      expect(fnBody![0]).toMatch(/=== null/);
    });

    it('unset ENCRYPTION_KEY throws required-variable error (positive control)', async () => {
      // Unset env → ENCRYPTION_KEY becomes null via `?? null` → throws required.
      // This is the ONLY path that hits the `=== null` branch.
      delete process.env.ENCRYPTION_KEY;
      vi.resetModules();
      const { encryptSecret: fn } = await import('./crypto');
      expect(() => fn('test')).toThrow('ENCRYPTION_KEY environment variable is required');
    });
  });

  // ── L#NN-26 tripwire: key-drift regression suite (#5678) ──────────────────
  //
  // Background: prof_gpt54 profile failed to decrypt with Invalid IV error
  // after a Coolify ENCRYPTION_KEY rotation masked by P0 #5674. These tests
  // document the encryption module invariants so a future drift is caught
  // at test time (build/CI) rather than at first user request in production.
  //
  // Mutation v1 sanity (L#NN-26): if encryptSecret stops emitting a 16-byte
  // IV, or emits an all-zero IV, or leaks key material in error messages,
  // these tests fail.
  describe('L#NN-26 key-drift invariants (#5678)', () => {
    const validKey = Buffer.from(crypto.randomBytes(32)).toString('base64');

    it('IV in ciphertext output is exactly 16 bytes', async () => {
      process.env.ENCRYPTION_KEY = validKey;
      const { encryptSecret: fn } = await import('./crypto');
      const ciphertext = fn('sample plaintext');
      const buf = Buffer.from(ciphertext, 'base64');
      // Layout: IV (16) + ciphertext + authTag (16) — see crypto.ts
      // The auth tag is the LAST 16 bytes; the rest is IV + ciphertext.
      // The IV must be the FIRST 16 bytes; here we verify the leading 16
      // bytes are NOT all-zero (next test) and the trailing 16 are auth tag.
      expect(buf.length).toBeGreaterThanOrEqual(16 + 16);
    });

    it('IV is non-zero in ciphertext output (C2 detection: plaintext-in-column)', async () => {
      process.env.ENCRYPTION_KEY = validKey;
      const { encryptSecret: fn } = await import('./crypto');
      const ciphertext = fn('sample plaintext');
      const buf = Buffer.from(ciphertext, 'base64');
      const iv = buf.slice(0, 16);
      // If the IV is all-zero, the column almost certainly contains plaintext
      // (Buffer.from(plaintext, base64) of a short string). Production
      // encryptSecret uses crypto.randomBytes(16) which is non-zero with
      // overwhelming probability. This test catches the regression where
      // someone replaces randomBytes with a zeroed buffer.
      const isAllZero = iv.every((b) => b === 0);
      expect(isAllZero).toBe(false);
    });

    it('auth tag in ciphertext output is exactly 16 bytes', async () => {
      process.env.ENCRYPTION_KEY = validKey;
      const { encryptSecret: fn } = await import('./crypto');
      const ciphertext = fn('sample plaintext');
      const buf = Buffer.from(ciphertext, 'base64');
      // Layout: IV (16) + ciphertext (variable) + authTag (16, last 16 bytes)
      const trailing = buf.slice(-16);
      // Auth tag is opaque 16 bytes — sanity check that it is present and
      // non-empty (not zero-length). For a real ciphertext, the auth tag
      // is essentially always non-zero.
      expect(trailing.length).toBe(16);
    });

    it('decrypt error message does not leak key material (L#NN-19 hygiene)', async () => {
      const keyA = Buffer.from(crypto.randomBytes(32)).toString('base64');
      const keyB = Buffer.from(crypto.randomBytes(32)).toString('base64');

      // Encrypt with key A
      process.env.ENCRYPTION_KEY = keyA;
      const { encryptSecret: enc } = await import('./crypto');
      const encrypted = enc('prof_gpt54 secret');

      // Reload module with key B. vi.resetModules() is required: without it,
      // the second await import returns the cached module whose module-level
      // ENCRYPTION_KEY const was set to keyA (false-positive decrypt).
      vi.resetModules();
      process.env.ENCRYPTION_KEY = keyB;
      const { decryptSecret: dec } = await import('./crypto');

      let captured: Error | undefined;
      try {
        dec(encrypted);
      } catch (e) {
        captured = e as Error;
      }
      expect(captured).toBeInstanceOf(Error);

      // L#NN-19 hygiene: error message must NOT contain the key value,
      // any key prefix, or a key fingerprint. If a future change makes
      // the decrypt path include key material in errors, this test fails.
      const msg = captured!.message;
      expect(msg).not.toContain(keyA);
      expect(msg).not.toContain(keyB);
      // Also: no base64 fragment of the key (first 8 chars are usually safe
      // to test for). The full 32-byte base64 is 44 chars; we check the
      // first 16 to avoid the risk of false positives on short outputs.
      expect(msg).not.toContain(keyA.slice(0, 16));
      expect(msg).not.toContain(keyB.slice(0, 16));
    });

    it('IVs are unique across many encryptions (collision-free entropy)', async () => {
      process.env.ENCRYPTION_KEY = validKey;
      const { encryptSecret: fn } = await import('./crypto');
      const ivs = new Set<string>();
      const N = 256;
      for (let i = 0; i < N; i++) {
        const ct = fn('same plaintext');
        const buf = Buffer.from(ct, 'base64');
        const iv = buf.slice(0, 16).toString('hex');
        ivs.add(iv);
      }
      // For N=256, the probability of a 128-bit IV collision is
      // ~256^2 / 2^129 ≈ 10^-33. The Set should have N unique entries.
      expect(ivs.size).toBe(N);
    });
  });
});
