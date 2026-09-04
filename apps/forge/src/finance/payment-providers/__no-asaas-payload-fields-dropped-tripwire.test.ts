/**
 * L#NN-50 #5878 tripwire: locks in the NormalizedAsaasPayment output shape
 * to detect silent field drift in `normalizeAsaasEvent` / `handleReceived`
 * / `handleConfirmed` / `handleFailed` / `handleRefunded`.
 *
 * Asaas webhook payload includes fields that current 5 handlers ignore
 * (silently dropped):
 * - `netValue`
 * - `invoiceUrl`
 * - `invoiceId`
 * - `lastRetryDate`
 * - `paymentDate`
 *
 * These are intentionally NOT in NormalizedAsaasPayment. Without this
 * tripwire, a future maintainer adding a field to the type would not
 * trigger a test failure — the omission would stay silent.
 *
 * Behavior:
 * - Test PASSES on current develop HEAD (output keys match documented list)
 * - Test FAILS if NormalizedAsaasPayment shape changes unintentionally
 *   (forces explicit update of the canonical list below)
 *
 * References:
 * - Issue: P2 #5878 (parent: #5993 P1 BUG analysis)
 * - Pattern: __no-asaas-bearer-revert-tripwire.test.ts, __no-bloated-parse-wrapper-tripwire.test.ts
 * - L#NN-50 tripwire family
 *
 * Tripwire adoption: uses readSource/relativeToHere from tripwire-helpers
 * to verify the type signature in asaas.ts declares each expected field
 * (L#NN-32 v8 / #6210 meta-tripwire compliance).
 */
import { describe, it, expect } from 'vitest';
import { normalizeAsaasEvent } from './asaas';
import { readSource, relativeToHere } from '../../tripwire-helpers';

describe('L#NN-50 tripwire — NormalizedAsaasPayment shape (issue #5878 P2)', () => {
  // Canonical NormalizedAsaasPayment field set. Update this list ONLY when
  // intentionally adding/removing a field on the destination type.
  const EXPECTED_KEYS = [
    'amountUsd', // (will be renamed to 'amount' per GAP-3 child issue)
    'currency',
    'customerId',
    'provider',
    'providerPaymentId',
    'rawEventJson',
    'status',
    'subscriptionId',
  ];

  it('asaas.ts type signature declares every documented NormalizedAsaasPayment field', () => {
    // Source-level guard: catches renaming / deletions of the type at compile time
    // boundary. Pairs with the runtime check below (both shapes must stay in sync).
    const asaasSource = readSource(relativeToHere('finance', 'payment-providers', 'asaas.ts'));
    const typeBlock = asaasSource.match(
      /type NormalizedAsaasPayment\s*=\s*{[\s\S]*?};/,
    );
    expect(typeBlock, 'NormalizedAsaasPayment type declaration missing from asaas.ts').not.toBeNull();
    if (typeBlock === null) return;
    const declared = typeBlock[0];
    for (const key of EXPECTED_KEYS) {
      const declRe = new RegExp('\\b' + key + '(\\s*[:?])');
      expect(
        declared,
        `NormalizedAsaasPayment declaration in asaas.ts is missing field "${key}"`,
      ).toMatch(declRe);
    }
  });

  // Full Asaas payload with all known fields (both used and dropped).
  // This represents the worst-case input shape; any missing field in
  // the input should NOT appear in the output unless documented.
  const fullPayload = {
    event: 'PAYMENT_RECEIVED',
    payment: {
      id: 'pay_1',
      customer: 'cust_1',
      value: 100,
      netValue: 95, // dropped
      billingType: 'CREDIT_CARD',
      status: 'RECEIVED',
      dueDate: '2026-09-15', // dropped
      paymentDate: '2026-09-10', // dropped
      lastRetryDate: null, // dropped
      invoiceUrl: 'https://asaas.com/i/123', // dropped
      invoiceId: 'inv_123', // dropped
      subscription: 'sub_1',
    },
  } as any;

  // (EXPECTED_KEYS is defined at the top of the describe block above;
  // referenced by both the type-source test and the runtime key shape test.)

  it('output has exactly the documented keys (no extras, no missing)', () => {
    const result = normalizeAsaasEvent(fullPayload);
    expect(result, 'normalizeAsaasEvent should produce a result for PAYMENT_RECEIVED').not.toBeNull();
    if (result === null) return;

    const actualKeys = Object.keys(result).sort();
    const expectedKeys = [...EXPECTED_KEYS].sort();

    expect(actualKeys, `output keys mismatch — got ${JSON.stringify(actualKeys)}`).toEqual(
      expectedKeys,
    );
  });

  it('subscriptionId is preserved when present in payload', () => {
    const result = normalizeAsaasEvent(fullPayload);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.subscriptionId).toBe('sub_1');
  });

  it('subscriptionId is undefined when payload omits subscription field', () => {
    // Handlers always emit the subscriptionId key (TypeScript ? marker does
    // not strip it at runtime). This test locks in the contract: when the
    // payload lacks subscription, the value is undefined, not null or empty
    // string. Future refactors must preserve this distinction.
    const payloadWithoutSub = {
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_2',
        customer: 'cust_2',
        value: 50,
        netValue: 47,
        billingType: 'BOLETO',
        status: 'RECEIVED',
        dueDate: '2026-09-20',
        paymentDate: '2026-09-15',
        lastRetryDate: null,
        invoiceUrl: 'https://asaas.com/i/124',
        invoiceId: 'inv_124',
      },
    };
    const result = normalizeAsaasEvent(payloadWithoutSub);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.subscriptionId).toBeUndefined();
    expect(result.subscriptionId).not.toBeNull();
    expect(result.subscriptionId).not.toBe('');
  });

  it('preserves dropped Asaas fields only in rawEventJson (not as top-level keys)', () => {
    // netValue, invoiceUrl, invoiceId, lastRetryDate, paymentDate must NOT
    // appear as keys in the output. They MIGHT appear inside rawEventJson
    // (which is just JSON.stringify(payload)).
    const result = normalizeAsaasEvent(fullPayload);
    expect(result).not.toBeNull();
    if (result === null) return;

    const droppedFields = ['netValue', 'invoiceUrl', 'invoiceId', 'lastRetryDate', 'paymentDate'];
    for (const f of droppedFields) {
      expect(f in result, `${f} should not be a top-level key on result`).toBe(false);
    }
  });
});
