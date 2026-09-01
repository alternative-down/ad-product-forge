/**
 * Unit tests for admin/routes/schemas/llm.ts.
 * Zod validation schemas for LLM profiles and system settings.
 */
import { describe, expect, it } from 'vitest';
import {
  upsertLlmProfileSchema,
  deleteLlmProfileSchema,
  updateLlmDefaultsSchema,
  upsertLlmModelPriceSchema,
  upsertSystemSettingsSchema,
} from './llm';

// ─── upsertLlmProfileSchema ────────────────────────────────────────────

describe('upsertLlmProfileSchema', () => {
  it('parses minimal valid input', () => {
    const result = upsertLlmProfileSchema.parse({
      name: 'GPT-4o',
      modelKey: 'gpt-4o',
      apiKey: 'sk-test',
    });
    expect(result.name).toBe('GPT-4o');
    expect(result.modelKey).toBe('gpt-4o');
  });

  it('parses with optional profileId', () => {
    const result = upsertLlmProfileSchema.parse({
      profileId: 'profile-1',
      name: 'n',
      modelKey: 'm',
      apiKey: 'sk-test',
    });
    expect(result.profileId).toBe('profile-1');
  });

  it('parses with optional tuning fields', () => {
    const result = upsertLlmProfileSchema.parse({
      name: 'n',
      modelKey: 'm',
      apiKey: 'sk-test',
      contractCostMultiplier: 1.5,
    });
    expect(result.contractCostMultiplier).toBe(1.5);
  });

  it('rejects missing name', () => {
    expect(() => upsertLlmProfileSchema.parse({ modelKey: 'm', apiKey: 'sk-test' })).toThrow();
  });

  it('rejects empty name', () => {
    expect(() =>
      upsertLlmProfileSchema.parse({ name: '', modelKey: 'm', apiKey: 'sk-test' }),
    ).toThrow();
  });

  it('rejects missing modelKey', () => {
    expect(() => upsertLlmProfileSchema.parse({ name: 'n', apiKey: 'sk-test' })).toThrow();
  });

  it('rejects missing apiKey', () => {
    expect(() => upsertLlmProfileSchema.parse({ name: 'n', modelKey: 'm' })).toThrow();
  });

  it('rejects negative contractCostMultiplier', () => {
    expect(() =>
      upsertLlmProfileSchema.parse({
        name: 'n',
        modelKey: 'm',
        apiKey: 'sk-test',
        contractCostMultiplier: -0.1,
      }),
    ).toThrow();
  });

  it('parses with optional baseUrl', () => {
    const result = upsertLlmProfileSchema.parse({
      name: 'n',
      modelKey: 'm',
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.com',
    });
    expect(result.baseUrl).toBe('https://api.example.com');
  });
});

// ─── deleteLlmProfileSchema ──────────────────────────────────────────

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

// ─── updateLlmDefaultsSchema ─────────────────────────────────────────

describe('updateLlmDefaultsSchema', () => {
  it('parses valid input with all required fields', () => {
    const result = updateLlmDefaultsSchema.parse({
      primaryProfileId: 'p1',
      omProfileId: 'p2',
      hiringRhProfileId: 'p3',
    });
    expect(result.primaryProfileId).toBe('p1');
    expect(result.omProfileId).toBe('p2');
    expect(result.hiringRhProfileId).toBe('p3');
  });

  it('rejects missing primaryProfileId', () => {
    expect(() =>
      updateLlmDefaultsSchema.parse({ omProfileId: 'p2', hiringRhProfileId: 'p3' }),
    ).toThrow();
  });

  it('rejects missing omProfileId', () => {
    expect(() =>
      updateLlmDefaultsSchema.parse({ primaryProfileId: 'p1', hiringRhProfileId: 'p3' }),
    ).toThrow();
  });

  it('rejects empty primaryProfileId', () => {
    expect(() =>
      updateLlmDefaultsSchema.parse({
        primaryProfileId: '',
        omProfileId: 'p2',
        hiringRhProfileId: 'p3',
      }),
    ).toThrow();
  });
});

// ─── upsertLlmModelPriceSchema ─────────────────────────────────────────

describe('upsertLlmModelPriceSchema', () => {
  it('parses minimal valid input', () => {
    const result = upsertLlmModelPriceSchema.parse({
      modelKey: 'gpt-4o',
      inputPerMillionUsd: 2.5,
      outputPerMillionUsd: 10,
    });
    expect(result.modelKey).toBe('gpt-4o');
    expect(result.inputPerMillionUsd).toBe(2.5);
    expect(result.outputPerMillionUsd).toBe(10);
  });

  it('parses with optional cache pricing', () => {
    const result = upsertLlmModelPriceSchema.parse({
      modelKey: 'm',
      inputPerMillionUsd: 1,
      outputPerMillionUsd: 1,
      inputCachePerMillionUsd: 0.1,
    });
    expect(result.inputCachePerMillionUsd).toBe(0.1);
  });

  it('rejects missing modelKey', () => {
    expect(() =>
      upsertLlmModelPriceSchema.parse({ inputPerMillionUsd: 1, outputPerMillionUsd: 1 }),
    ).toThrow();
  });

  it('rejects zero input price', () => {
    expect(() =>
      upsertLlmModelPriceSchema.parse({
        modelKey: 'm',
        inputPerMillionUsd: 0,
        outputPerMillionUsd: 1,
      }),
    ).toThrow();
  });

  it('rejects negative output price', () => {
    expect(() =>
      upsertLlmModelPriceSchema.parse({
        modelKey: 'm',
        inputPerMillionUsd: 1,
        outputPerMillionUsd: -1,
      }),
    ).toThrow();
  });
});

// ─── upsertSystemSettingsSchema ───────────────────────────────────────

describe('upsertSystemSettingsSchema', () => {
  it('parses minimal valid input', () => {
    const result = upsertSystemSettingsSchema.parse({});
    expect(result.companyName).toBe('');
    expect(result.companyContext).toBe('');
    expect(result.stepDelayEnabled).toBe(true);
  });

  it('parses all fields', () => {
    const result = upsertSystemSettingsSchema.parse({
      companyName: 'Acme',
      companyContext: 'AI-first company',
      stepDelayEnabled: false,
      communicationDmFlushingEnabled: true,
      communicationGroupFlushingEnabled: false,
      memoryLastMessagesFullEnabled: true,
      memoryLastMessagesCount: 50,
      tokenCountFilterEnabled: false,
      tokenCountFilterLimit: 200_000,
      checkpointedOmEnabled: true,
      checkpointedOmTotalContextTokens: 100_000,
      checkpointedOmRecentRawTokens: 20_000,
      checkpointedOmRawObservationBatchTokens: 10_000,
      checkpointedOmObservationReflectionBatchTokens: 10_000,
      checkpointedOmObservationSupportTokens: 4_000,
      checkpointedOmReflectionSupportTokens: 4_000,
      ltmRecallSearchMode: 'vector',
      ltmRecallWorkspaceTopK: 5,
      ltmRecallGraphTopK: 5,
      ltmRecallGraphThreshold: 0.8,
      ltmRecallGraphRandomWalkSteps: 100,
      ltmRecallGraphIncludeSources: false,
      ltmRecallScoreThreshold: 0.8,
      ltmRecallDocumentCount: 5,
    });
    expect(result.companyName).toBe('Acme');
    expect(result.ltmRecallSearchMode).toBe('vector');
    expect(result.ltmRecallGraphThreshold).toBe(0.8);
  });

  it('rejects invalid ltmRecallSearchMode', () => {
    expect(() => upsertSystemSettingsSchema.parse({ ltmRecallSearchMode: 'invalid' })).toThrow();
  });

  it('rejects negative memoryLastMessagesCount', () => {
    expect(() => upsertSystemSettingsSchema.parse({ memoryLastMessagesCount: -1 })).toThrow();
  });

  it('rejects ltmRecallGraphThreshold outside 0-1', () => {
    expect(() => upsertSystemSettingsSchema.parse({ ltmRecallGraphThreshold: 1.5 })).toThrow();
  });
});
