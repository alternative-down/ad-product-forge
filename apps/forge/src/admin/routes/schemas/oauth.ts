import { z } from 'zod';

export const oauthSyncProviderSchema = z.enum(['openai-codex', 'anthropic', 'all']);

export const syncOauthSchema = z.object({
  provider: oauthSyncProviderSchema,
});

// =============================================================================
// FINANCE SCHEMAS
// =============================================================================
