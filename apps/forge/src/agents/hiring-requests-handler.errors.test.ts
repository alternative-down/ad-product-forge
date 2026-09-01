/**
 * Tests for Pattern L typed Errors in agents/hiring-requests-handler module (D51 #6502 batch 24).
 *
 * Each test verifies:
 *   1. The thrown error is an instanceof the typed Error class
 *   2. The error code matches the expected discriminator
 *   3. The message text is preserved verbatim for backward compatibility
 *   4. Domain fields (hiringRhModelKey) are exposed on the error for downstream consumers
 *
 * See apps/forge/src/agents/hiring-requests-handler.errors.ts.
 */

import { describe, expect, it } from 'vitest';

import {
  HiringInsufficientCompanyCashError,
  HiringMissingLLMModelPriceError,
} from './hiring-requests-handler.errors';

describe('hiring-requests-handler — Pattern L typed Errors (D51 #6502 batch 24)', () => {
  it('HiringMissingLLMModelPriceError captures hiringRhModelKey and preserves message', () => {
    const hiringRhModelKey = 'gpt-4o';
    const error = new HiringMissingLLMModelPriceError(hiringRhModelKey);
    expect(error).toBeInstanceOf(HiringMissingLLMModelPriceError);
    expect(error.code).toBe('HIRING_MISSING_LLM_MODEL_PRICE');
    expect(error.hiringRhModelKey).toBe(hiringRhModelKey);
    expect(error.message).toContain('Missing LLM model price for hiring workflow');
    expect(error.message).toContain(hiringRhModelKey);
  });

  it('HiringInsufficientCompanyCashError has discriminator and preserved message', () => {
    const error = new HiringInsufficientCompanyCashError();
    expect(error).toBeInstanceOf(HiringInsufficientCompanyCashError);
    expect(error.code).toBe('HIRING_INSUFFICIENT_COMPANY_CASH');
    expect(error.message).toBe('Insufficient company cash for hiring workflow');
  });
});
