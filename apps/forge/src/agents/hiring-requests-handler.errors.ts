/**
 * Typed Error subclasses for the agents/hiring-requests-handler module (Pattern L, D51 #6502 batch 24).
 *
 * Replaces 2 raw `throw new Error(...)` calls in hiring-requests-handler.ts with 2
 * typed Error subclasses so consumers can use `err instanceof XError` instead of
 * parsing human-readable messages. See #6502.
 *
 * Migration impact: 2 literal `throw new Error(...)` calls in
 * apps/forge/src/agents/hiring-requests-handler.ts collapse to 2 typed Error
 * classes. Message format is preserved verbatim for backward compatibility with
 * existing test substrings and #6015 L#NN-46 transaction semantics.
 *
 * Pattern reference: apps/forge/src/agents/skills-tools.errors.ts (D51 batch 23 — Aldric).
 */

export class HiringMissingLLMModelPriceError extends Error {
  readonly code = 'HIRING_MISSING_LLM_MODEL_PRICE' as const;
  readonly hiringRhModelKey: string;
  constructor(hiringRhModelKey: string) {
    super(`Missing LLM model price for hiring workflow: ${hiringRhModelKey}`);
    this.name = 'HiringMissingLLMModelPriceError';
    this.hiringRhModelKey = hiringRhModelKey;
  }
}

export class HiringInsufficientCompanyCashError extends Error {
  readonly code = 'HIRING_INSUFFICIENT_COMPANY_CASH' as const;
  constructor() {
    super('Insufficient company cash for hiring workflow');
    this.name = 'HiringInsufficientCompanyCashError';
  }
}
