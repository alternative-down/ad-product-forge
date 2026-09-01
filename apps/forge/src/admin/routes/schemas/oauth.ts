import { z } from 'zod';

const oauthSyncProviderSchema = z.enum(['openai-codex', 'anthropic', 'all']);

export const syncOauthSchema = z.object({
  provider: oauthSyncProviderSchema,
});

// =============================================================================
// FINANCE SCHEMAS
// =============================================================================
