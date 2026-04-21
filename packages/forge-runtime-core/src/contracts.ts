import { z } from 'zod';

export const forgeMcpStdioServerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  transport: z.literal('stdio'),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
});

export const forgeMcpHttpServerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  transport: z.literal('http-stream'),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).default({}),
});

export const forgeMcpServerSchema = z.union([
  forgeMcpStdioServerSchema,
  forgeMcpHttpServerSchema,
]);

export type ForgeMcpServerConfig = z.infer<typeof forgeMcpServerSchema>;

export const forgeAgentRuntimeConfigSchema = z.object({
  agentId: z.string().min(1),
  runtimeId: z.string().optional(),
  threadId: z.string().min(1),
  assistantAuthorId: z.string().optional(),
  maxConversationMessages: z.number().int().positive().default(20),
  consolidateConversationOverflow: z.boolean().default(true),
});

export type ForgeAgentRuntimeConfig = z.infer<typeof forgeAgentRuntimeConfigSchema>;
