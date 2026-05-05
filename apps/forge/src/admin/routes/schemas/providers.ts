import { z } from 'zod';

// fallow-ignore-next-line unused-export
export const upsertAgentProviderSchema = z.object({
  agentId: z.string().min(1),
  providerType: z.enum(['discord', 'email']),
  credentials: z.record(z.string(), z.string()).optional(),
});

// fallow-ignore-next-line unused-export
export const deleteAgentProviderSchema = z.object({
  agentId: z.string().min(1),
  providerType: z.enum(['discord', 'email']),
});

// =============================================================================
// MCP SERVER SCHEMAS
// =============================================================================

// fallow-ignore-next-line unused-export
export const systemIntegrationProviderSchema = z.enum(['migadu', 'coolify', 'github', 'minimax']);

export const upsertSystemIntegrationSchema = z.discriminatedUnion('providerType', [
  z.object({
    providerType: z.literal('migadu'),
    isEnabled: z.boolean().default(true),
    config: z.object({
      apiUser: z.string().email(),
      apiKey: z.string().min(1),
    }),
  }),
  z.object({
    providerType: z.literal('coolify'),
    isEnabled: z.boolean().default(true),
    config: z.object({
      baseUrl: z.string().url(),
      adminToken: z.string().min(1),
      serverId: z.string().min(1),
      destinationId: z.string().min(1),
      applicationsBaseDomain: z.string().min(1).optional(),
    }),
  }),
  z.object({
    providerType: z.literal('github'),
    isEnabled: z.boolean().default(true),
    config: z.object({
      organization: z.string().min(1),
      appHomeUrl: z.string().url(),
    }),
  }),
  z.object({
    providerType: z.literal('minimax'),
    isEnabled: z.boolean().default(true),
    config: z.object({
      apiKey: z.string().min(1),
    }),
  }),
]);

export const deleteSystemIntegrationSchema = z.object({
  providerType: systemIntegrationProviderSchema,
});

// =============================================================================
// LLM SCHEMAS
// =============================================================================
