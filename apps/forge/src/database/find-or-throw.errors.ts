/**
 * Typed Error subclasses for the database/find-or-throw helper (Pattern L, D52 #6502 batch 27).
 *
 * Replaces 1 raw `throw new Error(...)` call in find-or-throw.ts with 1 typed
 * Error subclass so consumers can use `err instanceof XError` instead of parsing
 * human-readable messages. See #6502.
 *
 * Migration impact: 1 literal `throw new Error(...)` call in
 * apps/forge/src/database/find-or-throw.ts collapses to 1 typed Error class.
 * Message format is preserved verbatim for backward compatibility with
 * existing `.rejects.toThrow(<substring>)` tests:
 *   - apps/forge/src/database/find-or-throw.test.ts:55 expects 'agent not found: a1'
 *   - apps/forge/src/llm/settings-store.test.ts (4 sites) expects 'LLM profile not found: ...'
 *   - 20+ callers benefit from the typed error
 *
 * Pattern reference: apps/forge/src/finance/company-payables.errors.ts
 * (D52 batch 24 — Kaelen via Varek relay).
 */

export class FindOrThrowEntityNotFoundError extends Error {
  readonly code = 'FIND_OR_THROW_ENTITY_NOT_FOUND' as const;
  readonly entity: string;
  readonly idValue: string;

  constructor(entity: string, idValue: string) {
    super(`${entity} not found: ${idValue}`);
    this.name = 'FindOrThrowEntityNotFoundError';
    this.entity = entity;
    this.idValue = idValue;
  }
}
