import { z } from 'zod';

export const uploadAgentSkillsSchema = z.object({
  agentId: z.string().min(1),
  archiveBase64: z.string().min(1),
});

export const deleteAgentSkillSchema = z.object({
  agentId: z.string().min(1),
  skillName: z.string().min(1),
});

export const uploadSystemSkillsSchema = z.object({
  archiveBase64: z.string().min(1),
});

export const deleteSystemSkillSchema = z.object({
  skillName: z.string().min(1),
});

export const installGlobalSkillForAgentSchema = z.object({
  agentId: z.string().min(1),
  skillName: z.string().min(1),
});

export const publishAgentSkillToGlobalSchema = z.object({
  agentId: z.string().min(1),
  skillName: z.string().min(1),
});

// =============================================================================
// SYSTEM INTEGRATION SCHEMAS
// =============================================================================
