import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import type { Database } from '../database/index';
import { hasToolPermission } from '../capabilities/catalog';
import { createMicroErpReadModel } from './read-model';
import { adjustAgentContractBudget } from '../agents/adjust-agent-contract-budget';
import { createCompanyCashOperations } from '../finance/company-cash-operations';

const listCompanyCashInputSchema = z.object({
  direction: z.enum(['in', 'out']).optional(),
  status: z.enum(['planned', 'posted', 'canceled']).optional(),
  type: z.string().optional(),
  periodStart: z.coerce.number().int().optional(),
  periodEnd: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const manageCompanyCashMovementInputSchema = z.object({
  action: z
    .enum(['record_in', 'record_out', 'schedule_in', 'schedule_out', 'post_planned', 'cancel_planned'])
    .describe('The cash movement operation to perform.'),
  entryId: z.string().min(1).optional().describe('Required for post_planned and cancel_planned.'),
  type: z.string().min(1).optional().describe('Required for record_* and schedule_* actions.'),
  amountUsd: z.coerce.number().positive().optional().describe('Required for record_* and schedule_* actions.'),
  description: z.string().min(1).optional(),
  referenceType: z.string().min(1).optional(),
  referenceId: z.string().min(1).optional(),
  effectiveAt: z.coerce.number().int().optional().describe('Optional posting time for record_* and post_planned.'),
  dueAt: z.coerce.number().int().optional().describe('Required for schedule_in and schedule_out.'),
});

function validateCompanyCashMovementInput(input: z.infer<typeof manageCompanyCashMovementInputSchema>) {
  if (input.action === 'post_planned' || input.action === 'cancel_planned') {
    if (input.entryId) {
      return null;
    }

    return {
      valid: false as const,
      error: 'entryId is required for post_planned and cancel_planned',
      hint: 'Use list_company_cash to find the planned entryId before trying to post or cancel it.',
    };
  }

  if (!input.type) {
    return {
      valid: false as const,
      error: 'type is required for record and schedule actions',
      hint: 'Provide the movement type, such as infrastructure, payroll, or revenue.',
    };
  }

  if (input.amountUsd === null || input.amountUsd === undefined) {
    return {
      valid: false as const,
      error: 'amountUsd is required for record and schedule actions',
      hint: 'Provide the USD amount for this movement.',
    };
  }

  if ((input.action === 'schedule_in' || input.action === 'schedule_out') && !input.dueAt) {
    return {
      valid: false as const,
      error: 'dueAt is required for scheduled cash movements',
      hint: 'Provide the due date as a unix timestamp in milliseconds.',
    };
  }

  return null;
}

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
        try {
          return await microErp.getCompanyCashBalance();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Try again in a moment. If the problem persists, verify the finance ledger is available.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_company_cash')) {
    tools.list_company_cash = createTool({
      id: 'list_company_cash',
      description: 'List company cash movements for the selected period and return the cash summary. Use this when you need to inspect income, expenses, or balance changes.',
      inputSchema: listCompanyCashInputSchema,
      execute: async (input) => {
        try {
          return await microErp.listCompanyCashMovements(input);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Review the selected filters and period, then try again.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_internal_agent_contracts')) {
    tools.list_internal_agent_contracts = createTool({
      id: 'list_internal_agent_contracts',
      description: 'List the active contracts for internal agents, including budget usage and recent execution interval. Use this before deciding whether a contract needs a budget adjustment.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          return await microErp.listActiveInternalAgentContracts();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Try again in a moment. If the problem persists, verify the contract store is available.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_company_cash_movement')) {
    tools.manage_company_cash_movement = createTool({
      id: 'manage_company_cash_movement',
      description: 'Create and manage company cash movements. Use this to record immediate entries, schedule planned entries, post a planned entry, or cancel a planned entry.',
      inputSchema: manageCompanyCashMovementInputSchema,
      execute: async (input) => {
        const validation = validateCompanyCashMovementInput(input);

        if (validation) {
          return validation;
        }

        try {
          if (input.action === 'record_in') {
            const result = await companyCash.recordCashIn(input);
            return { valid: true, action: input.action, ...result };
          }

          if (input.action === 'record_out') {
            const result = await companyCash.recordCashOut(input);
            return { valid: true, action: input.action, ...result };
          }

          if (input.action === 'schedule_in') {
            const result = await companyCash.scheduleCashIn(input);
            return { valid: true, action: input.action, ...result };
          }

          if (input.action === 'schedule_out') {
            const result = await companyCash.scheduleCashOut(input);
            return { valid: true, action: input.action, ...result };
          }

          if (input.action === 'post_planned') {
            const result = await companyCash.postPlannedEntry(input.entryId, {
              effectiveAt: input.effectiveAt,
            });
            return { valid: true, action: input.action, ...result };
          }

          const result = await companyCash.cancelPlannedEntry(input.entryId);
          return { valid: true, action: input.action, ...result };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Use list_company_cash to confirm the movement exists and whether it is planned or already posted.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'adjust_agent_contract_budget')) {
    tools.adjust_agent_contract_budget = createTool({
      id: 'adjust_agent_contract_budget',
      description: 'Set a new budget target for an internal agent contract. You can increase or decrease it, but not below what has already been spent. Returns the updated contract information.',
      inputSchema: z.object({
        agentId: z.string().min(1).describe('The agentId of the agent whose contract budget should be changed.'),
        newBudgetUsd: z.coerce.number().min(0).describe('The new total budget, in USD, that the contract should have after the change.'),
      }),
      execute: async (input) => {
        try {
          const result = await adjustAgentContractBudget(db, {
            agentId: input.agentId,
            newBudgetUsd: input.newBudgetUsd,
          });
          return {
            valid: true,
            ...result,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Use list_internal_agent_contracts to confirm the agent contract exists and is not currently running.',
          };
        }
      },
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
