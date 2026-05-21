import { z } from 'zod';

export const upsertLlmProfileSchema = z.object({
  profileId: z.string().min(1).optional(),
  name: z.string().min(1),
  modelKey: z.string().min(1),
  baseUrl: z.string().url().optional().nullable(),
  apiKey: z.string().min(1),
  contractCostMultiplier: z.number().positive().optional(),
  isEnabled: z.boolean().optional(),
});

export const deleteLlmProfileSchema = z.object({
  profileId: z.string().min(1),
});

export const updateLlmDefaultsSchema = z.object({
  primaryProfileId: z.string().min(1),
  omProfileId: z.string().min(1),
  hiringRhProfileId: z.string().min(1),
});

export const upsertLlmModelPriceSchema = z.object({
  modelKey: z.string().min(1),
  inputPerMillionUsd: z.number().positive(),
  outputPerMillionUsd: z.number().positive(),
  inputCachePerMillionUsd: z.number().positive().optional(),
});

// =============================================================================
// SYSTEM SETTINGS SCHEMAS
// =============================================================================

export const upsertSystemSettingsSchema = z.object({
  companyName: z.string().default(''),
  companyContext: z.string().default(''),
  stepDelayEnabled: z.boolean().default(true),
  communicationDmFlushingEnabled: z.boolean().default(true),
  communicationGroupFlushingEnabled: z.boolean().default(true),
  memoryLastMessagesFullEnabled: z.boolean().default(false),
  memoryLastMessagesCount: z.number().int().positive().default(20),
  tokenCountFilterEnabled: z.boolean().default(true),
  tokenCountFilterLimit: z.number().int().positive().default(100000),
  checkpointedOmEnabled: z.boolean().default(false),
  checkpointedOmTotalContextTokens: z.number().int().positive().default(50000),
  checkpointedOmRecentRawTokens: z.number().int().positive().default(10000),
  checkpointedOmRawObservationBatchTokens: z.number().int().positive().default(5000),
  checkpointedOmObservationReflectionBatchTokens: z.number().int().positive().default(5000),
  checkpointedOmObservationSupportTokens: z.number().int().positive().default(2000),
  checkpointedOmReflectionSupportTokens: z.number().int().positive().default(2000),
  ltmRecallSearchMode: z.enum(['hybrid', 'vector', 'graph', 'bm25']).default('hybrid'),
  ltmRecallWorkspaceTopK: z.number().int().positive().default(3),
  ltmRecallGraphTopK: z.number().int().positive().default(3),
  ltmRecallGraphThreshold: z.number().min(0).max(1).default(0.7),
  ltmRecallGraphRandomWalkSteps: z.number().int().positive().default(50),
  ltmRecallGraphIncludeSources: z.boolean().default(true),
  ltmRecallScoreThreshold: z.number().min(0).max(1).default(0.7),
  ltmRecallDocumentCount: z.number().int().positive().default(3),
});

// =============================================================================
// OAUTH SCHEMAS
// =============================================================================
