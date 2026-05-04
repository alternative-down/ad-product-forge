import { z } from 'zod';

export const upsertLlmProfileSchema = z.object({
  profileId: z.string().min(1).optional(),
  name: z.string().min(1),
  modelId: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  systemPrompt: z.string().optional(),
});

export const deleteLlmProfileSchema = z.object({
  profileId: z.string().min(1),
});

export const updateLlmDefaultsSchema = z.object({
  defaultModelId: z.string().min(1).optional(),
  defaultTemperature: z.number().min(0).max(2).optional(),
  defaultMaxTokens: z.number().int().positive().optional(),
});

export const upsertLlmModelPriceSchema = z.object({
  modelId: z.string().min(1),
  inputPricePer1M: z.number().positive(),
  outputPricePer1M: z.number().positive(),
  cacheReadPricePer1M: z.number().positive().optional(),
  cacheWritePricePer1M: z.number().positive().optional(),
});

// =============================================================================
// SYSTEM SETTINGS SCHEMAS
// =============================================================================

export const upsertSystemSettingsSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
  description: z.string().optional(),
});

// =============================================================================
// OAUTH SCHEMAS
// =============================================================================
