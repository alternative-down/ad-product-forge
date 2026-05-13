import { z } from 'zod';

export const upsertAgentProviderSchema = z.object({
  agentId: z.string(),
  providerType: z.string(),
  credentials: z.record(z.string(), z.string()),
}).strict();

export const deleteAgentProviderSchema = z.object({
  agentId: z.string(),
  providerType: z.string(),
}).strict();

export const createAgentMcpServerSchema = z.object({
  agentId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  transport: z.string(),
  command: z.string().optional(),
  argsText: z.string().optional(),
  envVarsText: z.string().optional(),
  url: z.string().optional(),
  headersText: z.string().optional(),
  isActive: z.boolean().optional(),
}).strict();

export const updateAgentMcpServerSchema = z.object({
  serverId: z.string(),
  agentId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  transport: z.string().optional(),
  command: z.string().optional(),
  argsText: z.string().optional(),
  envVarsText: z.string().optional(),
  url: z.string().optional(),
  headersText: z.string().optional(),
  isActive: z.boolean().optional(),
}).strict();

export const deleteAgentMcpServerSchema = z.object({
  serverId: z.string(),
  agentId: z.string(),
}).strict();

export const assignAgentMcpServerSchema = z.object({
  agentId: z.string(),
  serverId: z.string(),
}).strict();

export const setAgentMcpServerActiveSchema = z.object({
  agentId: z.string(),
  serverId: z.string(),
  isActive: z.boolean(),
}).strict();

export const detachAgentMcpServerSchema = z.object({
  agentId: z.string(),
  serverId: z.string(),
}).strict();

export const publishAgentSkillToGlobalSchema = z.object({
  agentId: z.string(),
  skillName: z.string(),
}).strict();

export const installGlobalSkillForAgentSchema = z.object({
  agentId: z.string(),
  skillName: z.string(),
}).strict();

export const uploadAgentSkillsSchema = z.object({
  agentId: z.string(),
  skillsZipBase64: z.string(),
}).strict();

export const deleteAgentSkillSchema = z.object({
  agentId: z.string(),
  skillName: z.string(),
}).strict();

export const createRoleSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
}).strict();

export const updateRoleSchema = z.object({
  roleId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
}).strict();

export const deleteRoleSchema = z.object({
  roleId: z.string(),
}).strict();

export const roleCapabilitySchema = z.object({
  roleId: z.string(),
  capabilityName: z.string(),
  capabilityValue: z.boolean(),
}).strict();

export const roleToolPermissionSchema = z.object({
  roleId: z.string(),
  toolName: z.string(),
  allowed: z.boolean(),
}).strict();

export const roleWorkflowPermissionSchema = z.object({
  roleId: z.string(),
  workflowName: z.string(),
  allowed: z.boolean(),
}).strict();