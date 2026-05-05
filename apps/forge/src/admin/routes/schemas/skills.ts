import { z } from 'zod';

const uploadAgentSkillsSchema = z.object({
  agentId: z.string().min(1),
  archiveBase64: z.string().min(1),
});

const deleteAgentSkillSchema = z.object({
  agentId: z.string().min(1),
  skillName: z.string().min(1),
});

export const uploadSystemSkillsSchema = z.object({
  archiveBase64: z.string().min(1),
});

export const deleteSystemSkillSchema = z.object({
  skillName: z.string().min(1),
});

const installGlobalSkillForAgentSchema = z.object({
  agentId: z.string().min(1),
  skillName: z.string().min(1),
});

const publishAgentSkillToGlobalSchema = z.object({
  agentId: z.string().min(1),
  skillName: z.string().min(1),
});

// =============================================================================
// SYSTEM INTEGRATION SCHEMAS
// =============================================================================
