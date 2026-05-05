import { z } from 'zod';

// fallow-ignore-next-line unused-export
export const oauthSyncProviderSchema = z.enum(['openai-codex', 'anthropic', 'all']);

export const syncOauthSchema = z.object({
  provider: oauthSyncProviderSchema,
});

// =============================================================================
// FINANCE SCHEMAS
// =============================================================================
