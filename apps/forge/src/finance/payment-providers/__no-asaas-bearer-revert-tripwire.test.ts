/**
 * L#NN-50 tripwire (regression for #6043 P0 SEC):
 * `finance/payment-providers/asaas.ts` MUST verify webhook signatures using
 * HMAC + `webhookSecret`. It MUST NOT use the API key as a Bearer token.
 *
 * History: the original `verifyAsaasWebhookRequest` accepted an `apiKey`
 * parameter and compared it against the `Authorization: Bearer` header. This
 * sent the API key over the wire on every webhook and risked credential leak
 * if the header was logged. This tripwire prevents silent reverts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ASAAS_FILE = join(__dirname, 'asaas.ts');

describe('L#NN-50 tripwire — Asaas webhook MUST use HMAC, not Bearer (issue #6043 P0 SEC)', () => {
  const source = readFileSync(ASAAS_FILE, 'utf8');

  it('verifyAsaasWebhookRequest exists', () => {
    expect(source).toMatch(/export function verifyAsaasWebhookRequest\s*\(/);
  });

  it('verifyAsaasWebhookRequest uses createHmac (HMAC-SHA256 verification)', () => {
    expect(source).toMatch(/createHmac\(\s*['"]sha256['"]/);
  });

  it('verifyAsaasWebhookRequest uses timingSafeEqual (constant-time comparison)', () => {
    expect(source).toMatch(/timingSafeEqual\s*\(/);
  });

  it('verifyAsaasWebhookRequest does NOT use Bearer token auth', () => {
    // The function body must not contain "Bearer" — that was the old insecure pattern.
    const fnStart = source.indexOf('export function verifyAsaasWebhookRequest');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const braceStart = source.indexOf('{', fnStart);
    expect(braceStart).toBeGreaterThan(fnStart);
    let depth = 0;
    let braceEnd = -1;
    for (let i = braceStart; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) { braceEnd = i; break; }
      }
    }
    expect(braceEnd).toBeGreaterThan(braceStart);
    const body = source.slice(braceStart + 1, braceEnd);
    expect(body).not.toMatch(/Bearer/i);
    expect(body).not.toMatch(/startsWith\(\s*['"]Bearer\s/i);
  });

  it('verifyAsaasWebhookRequest does NOT compare raw apiKey against header', () => {
    // The old pattern sliced 7 chars from authHeader to get the token.
    // The new pattern does not.
    const fnStart = source.indexOf('export function verifyAsaasWebhookRequest');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const braceStart = source.indexOf('{', fnStart);
    expect(braceStart).toBeGreaterThan(fnStart);
    let depth = 0;
    let braceEnd = -1;
    for (let i = braceStart; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) { braceEnd = i; break; }
      }
    }
    expect(braceEnd).toBeGreaterThan(braceStart);
    const body = source.slice(braceStart + 1, braceEnd);
    expect(body).not.toMatch(/authHeader\.slice\(7\)/);
  });
});
