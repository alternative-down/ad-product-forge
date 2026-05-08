/**
 * Unit tests for admin/routes/schemas/llm.ts.
 * Zod validation schemas for LLM profile and system settings admin routes.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import {
  upsertLlmProfileSchema,
  deleteLlmProfileSchema,
  updateLlmDefaultsSchema,
  upsertLlmModelPriceSchema,
  upsertSystemSettingsSchema,
} from './llm';

// ─── upsertLlmProfileSchema ─────────────────────────────────────────────────

describe('upsertLlmProfileSchema', () => {
  it('parses minimal valid input (name + modelId)', () => {
    const result = upsertLlmProfileSchema.parse({ name: 'gpt-4o', modelId: 'gpt-4o-2024-08-06' });
    expect(result.name).toBe('gpt-4o');
    expect(result.modelId).toBe('gpt-4o-2024-08-06');
  });

  it('parses with optional profileId', () => {
    const result = upsertLlmProfileSchema.parse({ profileId: 'profile-1', name: 'n', modelId: 'm' });
    expect(result.profileId).toBe('profile-1');
  });

  it('parses with all optional fields', () => {
    const result = upsertLlmProfileSchema.parse({
      name: 'n', modelId: 'm', temperature: 0.7, maxTokens: 4096, systemPrompt: 'You are helpful',
    });
    expect(result.temperature).toBe(0.7);
    expect(result.maxTokens).toBe(4096);
    expect(result.systemPrompt).toBe('You are helpful');
  });

  it('rejects missing name', () => {
    expect(() => upsertLlmProfileSchema.parse({ modelId: 'm' })).toThrow();
  });

  it('rejects empty name', () => {
    expect(() => upsertLlmProfileSchema.parse({ name: '', modelId: 'm' })).toThrow();
  });

  it('rejects missing modelId', () => {
    expect(() => upsertLlmProfileSchema.parse({ name: 'n' })).toThrow();
  });

  it('rejects temperature below 0', () => {
    expect(() => upsertLlmProfileSchema.parse({ name: 'n', modelId: 'm', temperature: -0.1 })).toThrow();
  });

  it('rejects temperature above 2', () => {
    expect(() => upsertLlmProfileSchema.parse({ name: 'n', modelId: 'm', temperature: 2.1 })).toThrow();
  });

  it('accepts temperature at boundaries (0 and 2)', () => {
    expect(upsertLlmProfileSchema.parse({ name: 'n', modelId: 'm', temperature: 0 })).toMatchObject({ temperature: 0 });
    expect(upsertLlmProfileSchema.parse({ name: 'n', modelId: 'm', temperature: 2 })).toMatchObject({ temperature: 2 });
  });

  it('rejects non-integer maxTokens', () => {
    expect(() => upsertLlmProfileSchema.parse({ name: 'n', modelId: 'm', maxTokens: 1.5 })).toThrow();
  });

  it('rejects non-positive maxTokens', () => {
    expect(() => upsertLlmProfileSchema.parse({ name: 'n', modelId: 'm', maxTokens: 0 })).toThrow();
  });
});

// ─── deleteLlmProfileSchema ─────────────────────────────────────────────────

describe('deleteLlmProfileSchema', () => {
  it('parses with valid profileId', () => {
    expect(deleteLlmProfileSchema.parse({ profileId: 'profile-1' })).toMatchObject({ profileId: 'profile-1' });
  });

  it('rejects missing profileId', () => {
    expect(() => deleteLlmProfileSchema.parse({})).toThrow();
  });

  it('rejects empty profileId', () => {
    expect(() => deleteLlmProfileSchema.parse({ profileId: '' })).toThrow();
  });
});

// ─── updateLlmDefaultsSchema ────────────────────────────────────────────────

describe('updateLlmDefaultsSchema', () => {
  it('parses empty object (all optional)', () => {
    const result = updateLlmDefaultsSchema.parse({});
    expect(result).toEqual({});
  });

  it('parses with defaultModelId only', () => {
    const result = updateLlmDefaultsSchema.parse({ defaultModelId: 'gpt-4o' });
    expect(result.defaultModelId).toBe('gpt-4o');
  });

  it('parses with all optional fields', () => {
    const result = updateLlmDefaultsSchema.parse({
      defaultModelId: 'm', defaultTemperature: 0.5, defaultMaxTokens: 2048,
    });
    expect(result.defaultTemperature).toBe(0.5);
    expect(result.defaultMaxTokens).toBe(2048);
  });

  it('rejects temperature below 0', () => {
    expect(() => updateLlmDefaultsSchema.parse({ defaultTemperature: -0.1 })).toThrow();
  });

  it('rejects temperature above 2', () => {
    expect(() => updateLlmDefaultsSchema.parse({ defaultTemperature: 2.1 })).toThrow();
  });

  it('rejects non-positive defaultMaxTokens', () => {
    expect(() => updateLlmDefaultsSchema.parse({ defaultMaxTokens: 0 })).toThrow();
  });
});

// ─── upsertLlmModelPriceSchema ───────────────────────────────────────────────

describe('upsertLlmModelPriceSchema', () => {
  it('parses minimal valid input (modelId + two prices)', () => {
    const result = upsertLlmModelPriceSchema.parse({
      modelId: 'gpt-4o', inputPricePer1M: 2.5, outputPricePer1M: 10,
    });
    expect(result.modelId).toBe('gpt-4o');
    expect(result.inputPricePer1M).toBe(2.5);
    expect(result.outputPricePer1M).toBe(10);
  });

  it('parses with all optional cache prices', () => {
    const result = upsertLlmModelPriceSchema.parse({
      modelId: 'm', inputPricePer1M: 1, outputPricePer1M: 2, cacheReadPricePer1M: 0.1, cacheWritePricePer1M: 0.5,
    });
    expect(result.cacheReadPricePer1M).toBe(0.1);
    expect(result.cacheWritePricePer1M).toBe(0.5);
  });

  it('rejects missing modelId', () => {
    expect(() => upsertLlmModelPriceSchema.parse({ inputPricePer1M: 1, outputPricePer1M: 2 })).toThrow();
  });

  it('rejects empty modelId', () => {
    expect(() => upsertLlmModelPriceSchema.parse({ modelId: '', inputPricePer1M: 1, outputPricePer1M: 2 })).toThrow();
  });

  it('rejects zero inputPricePer1M', () => {
    expect(() => upsertLlmModelPriceSchema.parse({ modelId: 'm', inputPricePer1M: 0, outputPricePer1M: 1 })).toThrow();
  });

  it('rejects negative inputPricePer1M', () => {
    expect(() => upsertLlmModelPriceSchema.parse({ modelId: 'm', inputPricePer1M: -1, outputPricePer1M: 1 })).toThrow();
  });

  it('rejects zero outputPricePer1M', () => {
    expect(() => upsertLlmModelPriceSchema.parse({ modelId: 'm', inputPricePer1M: 1, outputPricePer1M: 0 })).toThrow();
  });
});

// ─── upsertSystemSettingsSchema ──────────────────────────────────────────────

describe('upsertSystemSettingsSchema', () => {
  it('parses minimal valid input', () => {
    const result = upsertSystemSettingsSchema.parse({ key: 'MAX_CONCURRENT_AGENTS', value: '10' });
    expect(result.key).toBe('MAX_CONCURRENT_AGENTS');
    expect(result.value).toBe('10');
  });

  it('parses with optional description', () => {
    const result = upsertSystemSettingsSchema.parse({
      key: 'k', value: 'v', description: 'Maximum concurrent agents allowed',
    });
    expect(result.description).toBe('Maximum concurrent agents allowed');
  });

  it('rejects missing key', () => {
    expect(() => upsertSystemSettingsSchema.parse({ value: 'v' })).toThrow();
  });

  it('rejects empty key', () => {
    expect(() => upsertSystemSettingsSchema.parse({ key: '', value: 'v' })).toThrow();
  });

  it('rejects missing value', () => {
    expect(() => upsertSystemSettingsSchema.parse({ key: 'k' })).toThrow();
  });

  it('rejects empty value', () => {
    expect(() => upsertSystemSettingsSchema.parse({ key: 'k', value: '' })).toThrow();
  });
});

// ─── safeParse (non-throwing) ─────────────────────────────────────────────

describe('schema.safeParse', () => {
  it('upsertLlmProfileSchema safeParse returns success false for missing name', () => {
    const result = upsertLlmProfileSchema.safeParse({ modelId: 'm' });
    expect(result.success).toBe(false);
  });

  it('upsertLlmModelPriceSchema safeParse returns success false for zero price', () => {
    const result = upsertLlmModelPriceSchema.safeParse({ modelId: 'm', inputPricePer1M: 0, outputPricePer1M: 1 });
    expect(result.success).toBe(false);
  });

  it('upsertSystemSettingsSchema safeParse returns success true for valid input', () => {
    const result = upsertSystemSettingsSchema.safeParse({ key: 'k', value: 'v' });
    expect(result.success).toBe(true);
  });

  it('updateLlmDefaultsSchema safeParse returns success true for empty object', () => {
    const result = updateLlmDefaultsSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});