import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import type { Database } from '../database/index';
import { hasToolPermission } from '../capabilities/catalog';
import { createMicroErpReadModel } from './read-model';
import { adjustAgentContractBudget } from '../agents/adjust-agent-contract-budget';

const listCompanyCashInputSchema = z.object({
  direction: z.enum(['in', 'out']).nullish(),
  status: z.enum(['planned', 'posted', 'canceled']).nullish(),
  type: z.string().nullish(),
  periodStart: z.number().int().nullish(),
  periodEnd: z.number().int().nullish(),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export function createMicroErpTools(db: Database, allowedToolIds?: Set<string> | null) {
  const microErp = createMicroErpReadModel(db);
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
      description: 'List the active contracts for internal agents. Use this before topping up or adjusting an agent budget.',
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

  if (hasToolPermission(allowedToolIds, 'adjust_agent_contract_budget')) {
    tools.adjust_agent_contract_budget = createTool({
      id: 'adjust_agent_contract_budget',
      description: 'Set a new budget target for an internal agent contract. You can increase or decrease it, but not below what has already been spent. Returns the updated contract information.',
      inputSchema: z.object({
        agentId: z.string().min(1).describe('The agentId of the agent whose contract budget should be changed.'),
        newBudgetUsd: z.number().min(0).describe('The new total budget, in USD, that the contract should have after the change.'),
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
