import { z } from 'zod';

/**
 * Schema for agent profile data generated during the hiring process.
 * Shared by hiring-requests-handler (definition) and hiring-validators (validation).
 */
export const generatedAgentProfileSchema = z.object({
  agentName: z.string().min(1),
  agentDescription: z.string().min(1),
  roleId: z.string().min(1),
  primaryGoal: z.string().min(1),
  secondaryGoals: z.array(z.string().min(1)).min(1),
  backstory: z.string().min(1),
});
