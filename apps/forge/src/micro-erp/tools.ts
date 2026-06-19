import { createTool, type Tool } from '@forge-runtime/core';
import { withToolErrorLogging } from '../capabilities/tools/error-wrapper';
import { z } from 'zod';

import type { Database } from '../database/client';
import { hasToolPermission } from '../capabilities/catalog';
import { createMicroErpReadModel } from './read-model';
import { adjustAgentContractBudget } from '../agents/adjust-agent-contract-budget';
import { createCompanyCashOperations } from '../finance/company-cash-operations';
import { COMPANY_CASH_DIRECTIONS, COMPANY_CASH_STATUSES } from '../finance/company-cash-enums';

const listCompanyCashInputSchema = z.object({
  direction: z.enum(COMPANY_CASH_DIRECTIONS).optional(),
  status: z.enum(COMPANY_CASH_STATUSES).optional(),
  type: z.string().optional(),
  periodStart: z.coerce.number().int().optional(),
  periodEnd: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const recordInSchema = z.object({
  type: z.string().min(1).describe('The movement type for the immediate cash-in entry.'),
  amountUsd: z.coerce.number().positive().describe('The USD amount for the immediate cash-in entry.'),
  description: z.string().optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  effectiveAt: z.coerce
    .number()
    .int()
    .optional()
    .describe('Optional posting time for the immediate cash-in entry.'),
});

const recordOutSchema = z.object({
  type: z.string().min(1).describe('The movement type for the immediate cash-out entry.'),
  amountUsd: z.coerce.number().positive().describe('The USD amount for the immediate cash-out entry.'),
  description: z.string().optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  effectiveAt: z.coerce
    .number()
    .int()
    .optional()
    .describe('Optional posting time for the immediate cash-out entry.'),
});

const scheduleInSchema = z.object({
  type: z.string().min(1).describe('The movement type for the planned cash-in entry.'),
  amountUsd: z.coerce.number().positive().describe('The USD amount for the planned cash-in entry.'),
  description: z.string().optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  dueAt: z.coerce
    .number()
    .int()
    .describe('The due date for the planned cash-in entry, as a unix timestamp in milliseconds.'),
});

const scheduleOutSchema = z.object({
  type: z.string().min(1).describe('The movement type for the planned cash-out entry.'),
  amountUsd: z.coerce.number().positive().describe('The USD amount for the planned cash-out entry.'),
  description: z.string().optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  dueAt: z.coerce
    .number()
    .int()
    .describe('The due date for the planned cash-out entry, as a unix timestamp in milliseconds.'),
});

const postPlannedSchema = z.object({
  entryId: z.string().min(1).describe('The planned entryId to post.'),
  effectiveAt: z.coerce
    .number()
    .int()
    .optional()
    .describe('Optional posting time for the planned entry.'),
});

const cancelPlannedSchema = z.object({
  entryId: z.string().min(1).describe('The planned entryId to cancel.'),
});

const manageCompanyCashMovementInputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('record_in'), recordIn: recordInSchema }),
  z.object({ action: z.literal('record_out'), recordOut: recordOutSchema }),
  z.object({ action: z.literal('schedule_in'), scheduleIn: scheduleInSchema }),
  z.object({ action: z.literal('schedule_out'), scheduleOut: scheduleOutSchema }),
  z.object({ action: z.literal('post_planned'), postPlanned: postPlannedSchema }),
  z.object({ action: z.literal('cancel_planned'), cancelPlanned: cancelPlannedSchema }),
]);

export function createMicroErpTools(db: Database, allowedToolIds?: Set<string> | null) {
  const microErp = createMicroErpReadModel(db);
  const companyCash = createCompanyCashOperations(db);
  const tools: Record<string, unknown> = {};

  if (hasToolPermission(allowedToolIds, 'get_company_cash')) {
    tools.get_company_cash = createTool({
      id: 'get_company_cash',
      description: 'Show the current company cash balance.',
      inputSchema: z.object({}),
      execute: async () => {
        return await withToolErrorLogging({
          scope: 'tools:micro-erp',
          op: 'get_company_cash',
          hint: 'Try again in a moment. If the problem persists, verify the finance ledger is available.',
          fn: async () => microErp.getCompanyCashBalance(),
        });
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_company_cash')) {
    tools.list_company_cash = createTool({
      id: 'list_company_cash',
      description:
        'List company cash movements for the selected period and return the cash summary. Use this when you need to inspect income, expenses, or balance changes.',
      inputSchema: listCompanyCashInputSchema,
      execute: async (input) => {
        return await withToolErrorLogging({
          scope: 'tools:micro-erp',
          op: 'list_company_cash',
          hint: 'Review the selected filters and period, then try again.',
          fn: async () => microErp.listCompanyCashMovements(input),
        });
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_internal_agent_contracts')) {
    tools.list_internal_agent_contracts = createTool({
      id: 'list_internal_agent_contracts',
      description:
        'List the active contracts for internal agents, including budget usage and recent execution interval. Use this before deciding whether a contract needs a budget adjustment.',
      inputSchema: z.object({}),
      execute: async () => {
        return await withToolErrorLogging({
          scope: 'tools:micro-erp',
          op: 'list_internal_agent_contracts',
          hint: 'Try again in a moment. If the problem persists, verify the contract store is available.',
          fn: async () => microErp.listActiveInternalAgentContracts(),
        });
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_company_cash_movement')) {
    tools.manage_company_cash_movement = createTool({
      id: 'manage_company_cash_movement',
      description:
        'Create and manage company cash movements. Use this to record immediate entries, schedule planned entries, post a planned entry, or cancel a planned entry.',
      inputSchema: manageCompanyCashMovementInputSchema,
      execute: async (input) => {
        return await withToolErrorLogging({
          scope: 'tools:micro-erp',
          op: `manage_company_cash_movement:${input.action}`,
          hint: 'Use list_company_cash to confirm the movement exists and whether it is planned or already posted.',
          fn: async () => {
            let result: { entryId: string; status?: string; effectiveAt?: number };
            switch (input.action) {
              case 'record_in':
                result = await companyCash.recordCashIn(input.recordIn);
                break;
              case 'record_out':
                result = await companyCash.recordCashOut(input.recordOut);
                break;
              case 'schedule_in':
                result = await companyCash.scheduleCashIn(input.scheduleIn);
                break;
              case 'schedule_out':
                result = await companyCash.scheduleCashOut(input.scheduleOut);
                break;
              case 'post_planned':
                result = await companyCash.postPlannedEntry(input.postPlanned.entryId, {
                  effectiveAt: input.postPlanned.effectiveAt,
                });
                break;
              case 'cancel_planned':
                result = await companyCash.cancelPlannedEntry(input.cancelPlanned.entryId);
                break;
            }
            return { valid: true, action: input.action, ...result };
          },
        });
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'adjust_agent_contract_budget')) {
    tools.adjust_agent_contract_budget = createTool({
      id: 'adjust_agent_contract_budget',
      description:
        'Set a new budget target for an internal agent contract. You can increase or decrease it, but not below what has already been spent. Returns the updated contract information.',
      inputSchema: z.object({
        agentId: z
          .string()
          .min(1)
          .describe('The agentId of the agent whose contract budget should be changed.'),
        newBudgetUsd: z.coerce
          .number()
          .min(0)
          .describe(
            'The new total budget, in USD, that the contract should have after the change.',
          ),
      }),
      execute: async (input) => {
        return await withToolErrorLogging({
          scope: 'tools:micro-erp',
          op: 'adjust_agent_contract_budget',
          hint: 'Use list_internal_agent_contracts to confirm the agent contract exists and is not currently running.',
          fn: async () => {
            const result = await adjustAgentContractBudget(db, {
              agentId: input.agentId,
              newBudgetUsd: input.newBudgetUsd,
            });
            return result;
          },
        });
      },
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
