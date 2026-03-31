import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import type { Database } from '../database/index';
import { hasToolPermission } from '../capabilities/catalog';
import { createMicroErpReadModel } from './read-model';
import { topUpActiveAgentContract } from '../agents/top-up-agent-contract';
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
      description: 'Return the current company cash balance.',
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
      description: 'List company cash ledger movements and return the cash summary for the selected period.',
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
      description: 'List active internal-agent contracts.',
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

  if (hasToolPermission(allowedToolIds, 'manage_internal_agent_contract')) {
    tools.manage_internal_agent_contract = createTool({
      id: 'manage_internal_agent_contract',
      description: 'Top up the active execution contract of one internal agent.',
      inputSchema: z.object({
        action: z.literal('top-up'),
        agentId: z.string().min(1),
        amountUsd: z.number().positive(),
      }),
      execute: async (input) => {
        try {
          const result = await topUpActiveAgentContract(db, {
            agentId: input.agentId,
            amountUsd: input.amountUsd,
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
            hint: 'Use list_internal_agent_contracts to confirm the agent has an active contract before topping it up.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'adjust_agent_contract_budget')) {
    tools.adjust_agent_contract_budget = createTool({
      id: 'adjust_agent_contract_budget',
      description: 'Adjust (increase or decrease) the budget of an internal agent contract. Use to set a new target budget. Cannot reduce below the already-spent amount. Cannot adjust while agent is running.',
      inputSchema: z.object({
        agentId: z.string().min(1),
        newBudgetUsd: z.number().min(0),
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
