import { z } from 'zod';

const mcpServerFieldsSchema = z.discriminatedUnion('transport', [
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

export const createAgentMcpServerSchema = z
  .object({
    agentId: z.string().min(1),
    name: z.string().trim().min(1),
    description: z.string().trim().optional().default(''),
    isActive: z.boolean().default(true),
  })
  .and(mcpServerFieldsSchema);

const updateAgentMcpServerSchema = z
  .object({
    agentId: z.string().min(1),
    configId: z.string().min(1),
    serverId: z.string().min(1),
    name: z.string().trim().min(1),
    description: z.string().trim().optional().default(''),
    isActive: z.boolean().default(true),
  })
  .and(mcpServerFieldsSchema);

const deleteAgentMcpServerSchema = z.object({
  agentId: z.string().min(1),
  configId: z.string().min(1),
  serverId: z.string().min(1),
});

export const upsertSystemMcpServerSchema = z
  .object({
    serverId: z.string().min(1).optional(),
    name: z.string().trim().min(1),
    description: z.string().trim().optional().default(''),
    isActive: z.boolean().default(true),
  })
  .and(mcpServerFieldsSchema);

export const deleteSystemMcpServerSchema = z.object({
  serverId: z.string().min(1),
});

const assignAgentMcpServerSchema = z.object({
  agentId: z.string().min(1),
  serverId: z.string().min(1),
  isActive: z.boolean().default(true),
});

const setAgentMcpServerActiveSchema = z.object({
  agentId: z.string().min(1),
  configId: z.string().min(1),
  isActive: z.boolean(),
});

const detachAgentMcpServerSchema = z.object({
  agentId: z.string().min(1),
  configId: z.string().min(1),
});

// =============================================================================
// AGENT SKILLS SCHEMAS
// =============================================================================
