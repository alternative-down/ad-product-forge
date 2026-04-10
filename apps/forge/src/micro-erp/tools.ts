import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import type { Database } from '../database/index';
import { hasToolPermission } from '../capabilities/catalog';
import { createMicroErpReadModel } from './read-model';
import { adjustAgentContractBudget } from '../agents/adjust-agent-contract-budget';
import { createCompanyCashOperations } from '../finance/company-cash-operations';

const listCompanyCashInputSchema = z.object({
  direction: z.enum(['in', 'out']).nullish(),
  status: z.enum(['planned', 'posted', 'canceled']).nullish(),
  type: z.string().nullish(),
  periodStart: z.coerce.number().int().nullish(),
  periodEnd: z.coerce.number().int().nullish(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const manageCompanyCashMovementInputSchema = z.object({
  action: z
    .enum(['record_in', 'record_out', 'schedule_in', 'schedule_out', 'post_planned', 'cancel_planned'])
    .describe('The cash movement operation to perform.'),
  recordIn: z.object({
    type: z.string().nullish().describe('Required movement type for the immediate cash-in entry.'),
    amountUsd: z.coerce.number().positive().nullish().describe('Required USD amount for the immediate cash-in entry.'),
    description: z.string().nullish(),
    referenceType: z.string().nullish(),
    referenceId: z.string().nullish(),
    effectiveAt: z.coerce.number().int().nullish().describe('Optional posting time for the immediate cash-in entry.'),
  }).nullish().describe('Provide this object only when action is record_in.'),
  recordOut: z.object({
    type: z.string().nullish().describe('Required movement type for the immediate cash-out entry.'),
    amountUsd: z.coerce.number().positive().nullish().describe('Required USD amount for the immediate cash-out entry.'),
    description: z.string().nullish(),
    referenceType: z.string().nullish(),
    referenceId: z.string().nullish(),
    effectiveAt: z.coerce.number().int().nullish().describe('Optional posting time for the immediate cash-out entry.'),
  }).nullish().describe('Provide this object only when action is record_out.'),
  scheduleIn: z.object({
    type: z.string().nullish().describe('Required movement type for the planned cash-in entry.'),
    amountUsd: z.coerce.number().positive().nullish().describe('Required USD amount for the planned cash-in entry.'),
    description: z.string().nullish(),
    referenceType: z.string().nullish(),
    referenceId: z.string().nullish(),
    dueAt: z.coerce.number().int().nullish().describe('Required due date for the planned cash-in entry.'),
  }).nullish().describe('Provide this object only when action is schedule_in.'),
  scheduleOut: z.object({
    type: z.string().nullish().describe('Required movement type for the planned cash-out entry.'),
    amountUsd: z.coerce.number().positive().nullish().describe('Required USD amount for the planned cash-out entry.'),
    description: z.string().nullish(),
    referenceType: z.string().nullish(),
    referenceId: z.string().nullish(),
    dueAt: z.coerce.number().int().nullish().describe('Required due date for the planned cash-out entry.'),
  }).nullish().describe('Provide this object only when action is schedule_out.'),
  postPlanned: z.object({
    entryId: z.string().nullish().describe('Required planned entryId to post.'),
    effectiveAt: z.coerce.number().int().nullish().describe('Optional posting time for the planned entry.'),
  }).nullish().describe('Provide this object only when action is post_planned.'),
  cancelPlanned: z.object({
    entryId: z.string().nullish().describe('Required planned entryId to cancel.'),
  }).nullish().describe('Provide this object only when action is cancel_planned.'),
});

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
        try {
          if (input.action === 'record_in') {
            if (!input.recordIn) {
              return {
                valid: false,
                error: 'recordIn is required when action is record_in',
                hint: 'Provide recordIn.type and recordIn.amountUsd.',
              };
            }

            if (!input.recordIn.type) {
              return {
                valid: false,
                error: 'recordIn.type is required when action is record_in',
                hint: 'Provide the movement type, such as infrastructure, payroll, or revenue.',
              };
            }

            if (input.recordIn.amountUsd === null || input.recordIn.amountUsd === undefined) {
              return {
                valid: false,
                error: 'recordIn.amountUsd is required when action is record_in',
                hint: 'Provide the USD amount for this movement.',
              };
            }

            const result = await companyCash.recordCashIn(input.recordIn);
            return { valid: true, action: input.action, ...result };
          }

          if (input.action === 'record_out') {
            if (!input.recordOut) {
              return {
                valid: false,
                error: 'recordOut is required when action is record_out',
                hint: 'Provide recordOut.type and recordOut.amountUsd.',
              };
            }

            if (!input.recordOut.type) {
              return {
                valid: false,
                error: 'recordOut.type is required when action is record_out',
                hint: 'Provide the movement type, such as infrastructure, payroll, or revenue.',
              };
            }

            if (input.recordOut.amountUsd === null || input.recordOut.amountUsd === undefined) {
              return {
                valid: false,
                error: 'recordOut.amountUsd is required when action is record_out',
                hint: 'Provide the USD amount for this movement.',
              };
            }

            const result = await companyCash.recordCashOut(input.recordOut);
            return { valid: true, action: input.action, ...result };
          }

          if (input.action === 'schedule_in') {
            if (!input.scheduleIn) {
              return {
                valid: false,
                error: 'scheduleIn is required when action is schedule_in',
                hint: 'Provide scheduleIn.type, scheduleIn.amountUsd, and scheduleIn.dueAt.',
              };
            }

            if (!input.scheduleIn.type) {
              return {
                valid: false,
                error: 'scheduleIn.type is required when action is schedule_in',
                hint: 'Provide the movement type, such as infrastructure, payroll, or revenue.',
              };
            }

            if (input.scheduleIn.amountUsd === null || input.scheduleIn.amountUsd === undefined) {
              return {
                valid: false,
                error: 'scheduleIn.amountUsd is required when action is schedule_in',
                hint: 'Provide the USD amount for this movement.',
              };
            }

            if (!input.scheduleIn.dueAt) {
              return {
                valid: false,
                error: 'scheduleIn.dueAt is required when action is schedule_in',
                hint: 'Provide the due date as a unix timestamp in milliseconds.',
              };
            }

            const result = await companyCash.scheduleCashIn(input.scheduleIn);
            return { valid: true, action: input.action, ...result };
          }

          if (input.action === 'schedule_out') {
            if (!input.scheduleOut) {
              return {
                valid: false,
                error: 'scheduleOut is required when action is schedule_out',
                hint: 'Provide scheduleOut.type, scheduleOut.amountUsd, and scheduleOut.dueAt.',
              };
            }

            if (!input.scheduleOut.type) {
              return {
                valid: false,
                error: 'scheduleOut.type is required when action is schedule_out',
                hint: 'Provide the movement type, such as infrastructure, payroll, or revenue.',
              };
            }

            if (input.scheduleOut.amountUsd === null || input.scheduleOut.amountUsd === undefined) {
              return {
                valid: false,
                error: 'scheduleOut.amountUsd is required when action is schedule_out',
                hint: 'Provide the USD amount for this movement.',
              };
            }

            if (!input.scheduleOut.dueAt) {
              return {
                valid: false,
                error: 'scheduleOut.dueAt is required when action is schedule_out',
                hint: 'Provide the due date as a unix timestamp in milliseconds.',
              };
            }

            const result = await companyCash.scheduleCashOut(input.scheduleOut);
            return { valid: true, action: input.action, ...result };
          }

          if (input.action === 'post_planned') {
            if (!input.postPlanned) {
              return {
                valid: false,
                error: 'postPlanned is required when action is post_planned',
                hint: 'Provide postPlanned.entryId and optionally postPlanned.effectiveAt.',
              };
            }

            if (!input.postPlanned.entryId) {
              return {
                valid: false,
                error: 'postPlanned.entryId is required when action is post_planned',
                hint: 'Use list_company_cash to find the planned entryId before posting it.',
              };
            }

            const result = await companyCash.postPlannedEntry(input.postPlanned.entryId, {
              effectiveAt: input.postPlanned.effectiveAt,
            });
            return { valid: true, action: input.action, ...result };
          }

          if (!input.cancelPlanned) {
            return {
              valid: false,
              error: 'cancelPlanned is required when action is cancel_planned',
              hint: 'Provide cancelPlanned.entryId.',
            };
          }

          if (!input.cancelPlanned.entryId) {
            return {
              valid: false,
              error: 'cancelPlanned.entryId is required when action is cancel_planned',
              hint: 'Use list_company_cash to find the planned entryId before canceling it.',
            };
          }

          const result = await companyCash.cancelPlannedEntry(input.cancelPlanned.entryId);
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
