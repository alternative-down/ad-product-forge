import { z } from 'zod';
export const agentIdQuerySchema = z.object({
  agentId: z.string().min(1),
});

export const agentExecutionStepsQuerySchema = z.object({
  agentId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const agentThreadMessagesQuerySchema = z.object({
  agentId: z.string().min(1),
  page: z.coerce.number().int().min(0).default(0),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export const agentConversationMessagesQuerySchema = z.object({
  agentId: z.string().min(1),
  provider: z.string().min(1),
  targetKey: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const roleToolPermissionSchema = z.object({
  roleId: z.string().min(1),
  toolId: z.string().min(1),
});

export const roleWorkflowPermissionSchema = z.object({
  roleId: z.string().min(1),
  workflowId: z.string().min(1),
});

export { createRoleSchema } from './routes/schemas/roles';

export const topUpAgentContractSchema = z.object({
  agentId: z.string().min(1),
  amountUsd: z.coerce.number().positive(),
});

export const hireAgentSchema = z.object({
  hiringRequest: z.string().min(1),
  additionalContext: z.string().optional(),
  weeklyBudgetUsd: z.coerce.number().positive(),
});

export const terminateAgentSchema = z.object({
  agentId: z.string().min(1),
});

export const changeAgentRoleSchema = z.object({
  agentId: z.string().min(1),
  roleId: z.string().min(1),
});

export const upsertAgentProviderSchema = z.object({
  agentId: z.string().min(1),
  providerType: z.enum(['discord', 'email']),
  credentials: z.record(z.string(), z.string()).optional(),
});

export const deleteAgentProviderSchema = z.object({
  agentId: z.string().min(1),
  providerType: z.enum(['discord', 'email']),
});

export const mcpServerFieldsSchema = z.discriminatedUnion('transport', [
  z.object({
    transport: z.literal('stdio'),
    command: z.string().trim().min(1),
    argsText: z.string().optional().default(''),
    envVarsText: z.string().optional().default(''),
    url: z.string().optional().default(''),
    headersText: z.string().optional().default(''),
  }),
  z.object({
    transport: z.literal('http_streamable'),
    url: z.string().trim().url(),
    headersText: z.string().optional().default(''),
    command: z.string().optional().default(''),
    argsText: z.string().optional().default(''),
    envVarsText: z.string().optional().default(''),
  }),
]);

export const updateRoleSchema = z.object({
  roleId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

export { deleteRoleSchema } from './routes/schemas/roles';
