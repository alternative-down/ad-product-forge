import { z } from 'zod';

// createPayableSchema is tested by schemas.test.ts (agent_contract/system_expense variants).
// Note: finance/write.ts uses a separate local schema (single/recurring variants) instead.
export const createPayableSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('agent_contract'),
    agentId: z.string().min(1),
    amount: z.number().positive(),
    description: z.string().optional(),
  }),
  z.object({
    kind: z.literal('system_expense'),
    description: z.string().min(1),
    amount: z.number().positive(),
    category: z.string().min(1),
  }),
]);
