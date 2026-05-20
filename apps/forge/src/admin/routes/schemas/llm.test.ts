/**
 * Unit tests for admin/routes/schemas/llm.ts.
 * Zod validation schemas for LLM profiles and system settings.
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

// ─── upsertLlmProfileSchema ─────────────────────────────────────────────

describe('upsertLlmProfileSchema', () => {
  it('parses minimal valid input', () => {
    const result = upsertLlmProfileSchema.parse({ name: 'GPT-4o', modelId: 'gpt-4o' });
    expect(result.name).toBe('GPT-4o');
    expect(result.modelId).toBe('gpt-4o');
  });

  it('parses with optional profileId', () => {
    const result = upsertLlmProfileSchema.parse({
      profileId: 'profile-1',
      name: 'n',
      modelId: 'm',
    });
    expect(result.profileId).toBe('profile-1');
  });

  it('parses with optional tuning fields', () => {
    const result = upsertLlmProfileSchema.parse({
      name: 'n',
      modelId: 'm',
      temperature: 0.7,
      maxTokens: 4096,
      systemPrompt: 'You are helpful',
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

  it('rejects empty modelId', () => {
    expect(() => upsertLlmProfileSchema.parse({ name: 'n', modelId: '' })).toThrow();
  });

  it('rejects temperature below 0', () => {
    expect(() =>
      upsertLlmProfileSchema.parse({ name: 'n', modelId: 'm', temperature: -0.1 }),
    ).toThrow();
  });

  it('rejects temperature above 2', () => {
    expect(() =>
      upsertLlmProfileSchema.parse({ name: 'n', modelId: 'm', temperature: 2.1 }),
    ).toThrow();
  });

  it('rejects zero maxTokens', () => {
    expect(() => upsertLlmProfileSchema.parse({ name: 'n', modelId: 'm', maxTokens: 0 })).toThrow();
  });

  it('rejects negative maxTokens', () => {
    expect(() =>
      upsertLlmProfileSchema.parse({ name: 'n', modelId: 'm', maxTokens: -1 }),
    ).toThrow();
  });
});

// ─── deleteLlmProfileSchema ────────────────────────────────────────────

describe('deleteLlmProfileSchema', () => {
  it('parses valid profileId', () => {
    expect(deleteLlmProfileSchema.parse({ profileId: 'profile-1' })).toMatchObject({
      profileId: 'profile-1',
    });
  });

  it('rejects missing profileId', () => {
    expect(() => deleteLlmProfileSchema.parse({})).toThrow();
  });

  it('rejects empty profileId', () => {
    expect(() => deleteLlmProfileSchema.parse({ profileId: '' })).toThrow();
  });
});

// ─── updateLlmDefaultsSchema ──────────────────────────────────────────

describe('updateLlmDefaultsSchema', () => {
  it('parses empty input (all optional)', () => {
    expect(updateLlmDefaultsSchema.parse({})).toMatchObject({});
  });

  it('parses with defaultModelId', () => {
    const result = updateLlmDefaultsSchema.parse({ defaultModelId: 'gpt-4o' });
    expect(result.defaultModelId).toBe('gpt-4o');
  });

  it('parses with defaultTemperature', () => {
    const result = updateLlmDefaultsSchema.parse({ defaultTemperature: 0.5 });
    expect(result.defaultTemperature).toBe(0.5);
  });

  it('parses with defaultMaxTokens', () => {
    const result = updateLlmDefaultsSchema.parse({ defaultMaxTokens: 8192 });
    expect(result.defaultMaxTokens).toBe(8192);
  });

  it('parses with all fields', () => {
    const result = updateLlmDefaultsSchema.parse({
      defaultModelId: 'm',
      defaultTemperature: 0.7,
      defaultMaxTokens: 4096,
    });
    expect(result.defaultModelId).toBe('m');
  });

  it('rejects temperature below 0', () => {
    expect(() => updateLlmDefaultsSchema.parse({ defaultTemperature: -0.1 })).toThrow();
  });

  it('rejects temperature above 2', () => {
    expect(() => updateLlmDefaultsSchema.parse({ defaultTemperature: 3 })).toThrow();
  });

  it('rejects non-positive maxTokens', () => {
    expect(() => updateLlmDefaultsSchema.parse({ defaultMaxTokens: 0 })).toThrow();
  });
});

// ─── upsertLlmModelPriceSchema ─────────────────────────────────────────

describe('upsertLlmModelPriceSchema', () => {
  it('parses minimal valid input', () => {
    const result = upsertLlmModelPriceSchema.parse({
      modelId: 'gpt-4o',
      inputPricePer1M: 2.5,
      outputPricePer1M: 10,
    });
    expect(result.modelId).toBe('gpt-4o');
    expect(result.inputPricePer1M).toBe(2.5);
    expect(result.outputPricePer1M).toBe(10);
  });

  it('parses with optional cache pricing', () => {
    const result = upsertLlmModelPriceSchema.parse({
      modelId: 'm',
      inputPricePer1M: 1,
      outputPricePer1M: 1,
      cacheReadPricePer1M: 0.1,
      cacheWritePricePer1M: 0.5,
    });
    expect(result.cacheReadPricePer1M).toBe(0.1);
    expect(result.cacheWritePricePer1M).toBe(0.5);
  });

  it('rejects missing modelId', () => {
    expect(() =>
      upsertLlmModelPriceSchema.parse({ inputPricePer1M: 1, outputPricePer1M: 1 }),
    ).toThrow();
  });

  it('rejects empty modelId', () => {
    expect(() =>
      upsertLlmModelPriceSchema.parse({ modelId: '', inputPricePer1M: 1, outputPricePer1M: 1 }),
    ).toThrow();
  });

  it('rejects zero inputPricePer1M', () => {
    expect(() =>
      upsertLlmModelPriceSchema.parse({ modelId: 'm', inputPricePer1M: 0, outputPricePer1M: 1 }),
    ).toThrow();
  });

  it('rejects negative outputPricePer1M', () => {
    expect(() =>
      upsertLlmModelPriceSchema.parse({ modelId: 'm', inputPricePer1M: 1, outputPricePer1M: -1 }),
    ).toThrow();
  });
});

// ─── upsertSystemSettingsSchema ───────────────────────────────────────

describe('upsertSystemSettingsSchema', () => {
  it('parses minimal valid input', () => {
    const result = upsertSystemSettingsSchema.parse({ key: 'SITE_URL', value: 'https://acme.com' });
    expect(result.key).toBe('SITE_URL');
    expect(result.value).toBe('https://acme.com');
  });

  it('parses with optional description', () => {
    const result = upsertSystemSettingsSchema.parse({
      key: 'k',
      value: 'v',
      description: 'Site URL for the app',
    });
    expect(result.description).toBe('Site URL for the app');
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

  it('deleteLlmProfileSchema safeParse returns success true for valid input', () => {
    const result = deleteLlmProfileSchema.safeParse({ profileId: 'p' });
    expect(result.success).toBe(true);
  });

  it('updateLlmDefaultsSchema safeParse returns success true for empty input', () => {
    const result = updateLlmDefaultsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('upsertLlmModelPriceSchema safeParse returns success false for missing outputPricePer1M', () => {
    const result = upsertLlmModelPriceSchema.safeParse({ modelId: 'm', inputPricePer1M: 1 });
    expect(result.success).toBe(false);
  });

  it('upsertSystemSettingsSchema safeParse returns success false for empty value', () => {
    const result = upsertSystemSettingsSchema.safeParse({ key: 'k', value: '' });
    expect(result.success).toBe(false);
  });
});
