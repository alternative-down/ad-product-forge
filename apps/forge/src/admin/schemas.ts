/**
 * Admin Schemas — Re-export shim (Day 16 #5740)
 *
 * Canonical definitions live in per-route files under `./routes/schemas/`.
 * This file exists as a backward-compatibility shim for legacy imports
 * (`import { ... } from '@/admin/schemas'`).
 *
 * Re-exported from per-route files (true duplicates):
 *   - agentIdQuerySchema, agentExecutionStepsQuerySchema,
 *     agentThreadMessagesQuerySchema, agentConversationMessagesQuerySchema
 *     (from ./routes/schemas/agents)
 *   - terminateAgentSchema, changeAgentRoleSchema
 *     (from ./routes/schemas/agents)
 *   - roleToolPermissionSchema, roleWorkflowPermissionSchema
 *     (from ./routes/schemas/roles)
 *
 * Intentional drift (kept as definitions, marked `// INTENTIONAL DRIFT`):
 *   - topUpAgentContractSchema — coerce version (`z.coerce.number()`) for
 *     the legacy route (admin/routes.ts) that parses body as text. The
 *     per-route version (z.number) in ./routes/schemas/agents is used
 *     by the new contract-ops.ts which goes through parseJsonBody first.
 *   - hireAgentSchema — same drift pattern as topUpAgentContractSchema.
 *
 * Unique (no per-route equivalent): upsertAgentProviderSchema,
 * deleteAgentProviderSchema. These are agent-related but not tied to
 * a specific route; they live here for backward compatibility.
 *
 * Tripwire: see apps/forge/src/__lnn-50-zod-dedup-tripwire.test.ts
 */

// Re-export everything from per-route files for backwards compatibility
// (legacy `import { ... } from '@/admin/schemas'`).
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- backward-compat shim consolidating 8 true-duplicate Zod schemas (#5740); without this, legacy importers would break
export {
  agentIdQuerySchema,
  agentExecutionStepsQuerySchema,
  agentThreadMessagesQuerySchema,
  agentConversationMessagesQuerySchema,
  terminateAgentSchema,
  changeAgentRoleSchema,
} from './routes/schemas/agents';

// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- backward-compat shim for 2 role schemas (#5740); legacy `admin/routes.ts` imports from here
export {
  roleToolPermissionSchema,
  roleWorkflowPermissionSchema,
} from './routes/schemas/roles';

import { z } from 'zod';

// INTENTIONAL DRIFT
// Legacy route parses body as text (z.coerce.number).
// Per-route version in ./routes/schemas/agents uses z.number (parseJsonBody).
export const topUpAgentContractSchema = z.object({
  agentId: z.string().min(1),
  amountUsd: z.coerce.number().positive(),
});

// INTENTIONAL DRIFT
// Legacy route parses body as text (z.coerce.number).
// Per-route version in ./routes/schemas/agents uses z.number (parseJsonBody).
export const hireAgentSchema = z.object({
  hiringRequest: z.string().min(1),
  additionalContext: z.string().optional(),
  weeklyBudgetUsd: z.coerce.number().positive(),
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
