/**
 * Typed Error subclasses for the coolify/helpers module (Pattern L, D51 #6502 batch 20).
 *
 * Replaces 2 raw `throw new Error(...)` calls in coolify/helpers.ts (extractCollection
 * + extractItem zod parsing fall-throughs) with 2 typed Error subclasses so consumers
 * can use `err instanceof XError` instead of parsing human-readable messages. See #6502.
 *
 * Migration impact: 2 literal `throw new Error(...)` calls in
 * apps/forge/src/coolify/helpers.ts collapse to 2 typed Error classes.
 * Message format is preserved verbatim for backward compatibility with
 * existing `.toThrow()` tests in helpers.test.ts.
 *
 * Pattern reference: apps/forge/src/admin/routes/helpers.errors.ts (D51 batch 19 — Varek),
 * apps/forge/src/coolify/provider-config.errors.ts (D51 batch 18 — Varek).
 */

export class CoolifyExtractCollectionError extends Error {
  readonly code = 'COOLIFY_EXTRACT_COLLECTION' as const;
  readonly dataSnapshot: string;
  constructor(dataSnapshot: string) {
    super(`Failed to extract item from: ${dataSnapshot}`);
    this.name = 'CoolifyExtractCollectionError';
    this.dataSnapshot = dataSnapshot;
  }
}

export class CoolifyExtractItemError extends Error {
  readonly code = 'COOLIFY_EXTRACT_ITEM' as const;
  readonly dataSnapshot: string;
  constructor(dataSnapshot: string) {
    super(`Failed to extract item from: ${dataSnapshot}`);
    this.name = 'CoolifyExtractItemError';
    this.dataSnapshot = dataSnapshot;
  }
}
