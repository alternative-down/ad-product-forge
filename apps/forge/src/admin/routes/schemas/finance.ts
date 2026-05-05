import { z } from 'zod';

// fallow-ignore-next-line unused-export
export const createInvestmentSchema = z.object({
  amount: z.number().positive(),
  description: z.string().min(1),
});

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

// fallow-ignore-next-line unused-export
export const ledgerEntryActionSchema = z.object({
  entryId: z.string().min(1),
  action: z.enum(['approve', 'cancel']),
});

// fallow-ignore-next-line unused-export
export const recurringPayableStatusSchema = z.object({
  payableId: z.string().min(1),
  isActive: z.boolean(),
});
