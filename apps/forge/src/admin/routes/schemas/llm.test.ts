import { describe, it, expect } from 'vitest';
import {
  upsertLlmProfileSchema,
  deleteLlmProfileSchema,
  updateLlmDefaultsSchema,
  upsertLlmModelPriceSchema,
  upsertSystemSettingsSchema,
} from './llm';

describe('upsertLlmProfileSchema', () => {
  it('validates valid profile with required fields', () => {
    const result = upsertLlmProfileSchema.parse({
      name: 'gpt-4',
      modelId: 'gpt-4',
    });
    expect(result.name).toBe('gpt-4');
    expect(result.modelId).toBe('gpt-4');
  });

  it('allows optional profileId for create', () => {
    const result = upsertLlmProfileSchema.parse({
      profileId: 'profile-123',
      name: 'gpt-4',
      modelId: 'gpt-4',
    });
    expect(result.profileId).toBe('profile-123');
  });

  it('applies optional temperature', () => {
    const result = upsertLlmProfileSchema.parse({
      name: 'gpt-4',
      modelId: 'gpt-4',
      temperature: 0.7,
    });
    expect(result.temperature).toBe(0.7);
  });

  it('applies optional maxTokens', () => {
    const result = upsertLlmProfileSchema.parse({
      name: 'gpt-4',
      modelId: 'gpt-4',
      maxTokens: 4000,
    });
    expect(result.maxTokens).toBe(4000);
  });

  it('applies optional systemPrompt', () => {
    const result = upsertLlmProfileSchema.parse({
      name: 'gpt-4',
      modelId: 'gpt-4',
      systemPrompt: 'You are a helpful assistant.',
    });
    expect(result.systemPrompt).toBe('You are a helpful assistant.');
  });

  it('rejects missing name', () => {
    expect(() => upsertLlmProfileSchema.parse({ modelId: 'gpt-4' })).toThrow();
  });

  it('rejects missing modelId', () => {
    expect(() => upsertLlmProfileSchema.parse({ name: 'gpt-4' })).toThrow();
  });

  it('rejects empty name', () => {
    expect(() => upsertLlmProfileSchema.parse({ name: '', modelId: 'gpt-4' })).toThrow();
  });

  it('rejects empty modelId', () => {
    expect(() => upsertLlmProfileSchema.parse({ name: 'gpt-4', modelId: '' })).toThrow();
  });

  it('rejects temperature below 0', () => {
    expect(() => upsertLlmProfileSchema.parse({
      name: 'gpt-4',
      modelId: 'gpt-4',
      temperature: -1,
    })).toThrow();
  });

  it('rejects temperature above 2', () => {
    expect(() => upsertLlmProfileSchema.parse({
      name: 'gpt-4',
      modelId: 'gpt-4',
      temperature: 3,
    })).toThrow();
  });

  it('rejects non-positive maxTokens', () => {
    expect(() => upsertLlmProfileSchema.parse({
      name: 'gpt-4',
      modelId: 'gpt-4',
      maxTokens: 0,
    })).toThrow();
  });

  it('rejects non-integer maxTokens', () => {
    expect(() => upsertLlmProfileSchema.parse({
      name: 'gpt-4',
      modelId: 'gpt-4',
      maxTokens: 1000.5,
    })).toThrow();
  });
});

describe('deleteLlmProfileSchema', () => {
  it('validates valid profileId', () => {
    const result = deleteLlmProfileSchema.parse({ profileId: 'profile-123' });
    expect(result.profileId).toBe('profile-123');
  });

  it('rejects missing profileId', () => {
    expect(() => deleteLlmProfileSchema.parse({})).toThrow();
  });

  it('rejects empty profileId', () => {
    expect(() => deleteLlmProfileSchema.parse({ profileId: '' })).toThrow();
  });
});

describe('updateLlmDefaultsSchema', () => {
  it('accepts partial update with defaultModelId', () => {
    const result = updateLlmDefaultsSchema.parse({ defaultModelId: 'gpt-4' });
    expect(result.defaultModelId).toBe('gpt-4');
  });

  it('accepts partial update with defaultTemperature', () => {
    const result = updateLlmDefaultsSchema.parse({ defaultTemperature: 0.5 });
    expect(result.defaultTemperature).toBe(0.5);
  });

  it('accepts partial update with defaultMaxTokens', () => {
    const result = updateLlmDefaultsSchema.parse({ defaultMaxTokens: 2000 });
    expect(result.defaultMaxTokens).toBe(2000);
  });

  it('accepts empty object (all optional)', () => {
    const result = updateLlmDefaultsSchema.parse({});
    expect(result).toEqual({});
  });

  it('rejects temperature below 0', () => {
    expect(() => updateLlmDefaultsSchema.parse({ defaultTemperature: -0.1 })).toThrow();
  });

  it('rejects temperature above 2', () => {
    expect(() => updateLlmDefaultsSchema.parse({ defaultTemperature: 2.5 })).toThrow();
  });

  it('rejects non-positive maxTokens', () => {
    expect(() => updateLlmDefaultsSchema.parse({ defaultMaxTokens: 0 })).toThrow();
  });

  it('rejects non-integer maxTokens', () => {
    expect(() => updateLlmDefaultsSchema.parse({ defaultMaxTokens: 1000.5 })).toThrow();
  });
});

describe('upsertLlmModelPriceSchema', () => {
  it('validates valid price with required fields', () => {
    const result = upsertLlmModelPriceSchema.parse({
      modelId: 'gpt-4',
      inputPricePer1M: 2.0,
      outputPricePer1M: 8.0,
    });
    expect(result.modelId).toBe('gpt-4');
    expect(result.inputPricePer1M).toBe(2.0);
    expect(result.outputPricePer1M).toBe(8.0);
  });

  it('accepts optional cache prices', () => {
    const result = upsertLlmModelPriceSchema.parse({
      modelId: 'gpt-4',
      inputPricePer1M: 2.0,
      outputPricePer1M: 8.0,
      cacheReadPricePer1M: 0.1,
      cacheWritePricePer1M: 0.5,
    });
    expect(result.cacheReadPricePer1M).toBe(0.1);
    expect(result.cacheWritePricePer1M).toBe(0.5);
  });

  it('rejects missing modelId', () => {
    expect(() => upsertLlmModelPriceSchema.parse({
      inputPricePer1M: 2.0,
      outputPricePer1M: 8.0,
    })).toThrow();
  });

  it('rejects missing inputPricePer1M', () => {
    expect(() => upsertLlmModelPriceSchema.parse({
      modelId: 'gpt-4',
      outputPricePer1M: 8.0,
    })).toThrow();
  });

  it('rejects missing outputPricePer1M', () => {
    expect(() => upsertLlmModelPriceSchema.parse({
      modelId: 'gpt-4',
      inputPricePer1M: 2.0,
    })).toThrow();
  });

  it('rejects non-positive inputPricePer1M', () => {
    expect(() => upsertLlmModelPriceSchema.parse({
      modelId: 'gpt-4',
      inputPricePer1M: 0,
      outputPricePer1M: 8.0,
    })).toThrow();
  });

  it('rejects non-positive outputPricePer1M', () => {
    expect(() => upsertLlmModelPriceSchema.parse({
      modelId: 'gpt-4',
      inputPricePer1M: 2.0,
      outputPricePer1M: -1,
    })).toThrow();
  });
});

describe('upsertSystemSettingsSchema', () => {
  it('validates valid settings with required fields', () => {
    const result = upsertSystemSettingsSchema.parse({
      key: 'feature_flags',
      value: 'enabled',
    });
    expect(result.key).toBe('feature_flags');
    expect(result.value).toBe('enabled');
  });

  it('accepts optional description', () => {
    const result = upsertSystemSettingsSchema.parse({
      key: 'feature_flags',
      value: 'enabled',
      description: 'Feature flags for the system',
    });
    expect(result.description).toBe('Feature flags for the system');
  });

  it('rejects missing key', () => {
    expect(() => upsertSystemSettingsSchema.parse({
      value: 'enabled',
    })).toThrow();
  });

  it('rejects missing value', () => {
    expect(() => upsertSystemSettingsSchema.parse({
      key: 'feature_flags',
    })).toThrow();
  });

  it('rejects empty key', () => {
    expect(() => upsertSystemSettingsSchema.parse({
      key: '',
      value: 'enabled',
    })).toThrow();
  });

  it('rejects empty value', () => {
    expect(() => upsertSystemSettingsSchema.parse({
      key: 'feature_flags',
      value: '',
    })).toThrow();
  });
});
