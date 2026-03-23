import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import type { Database } from '../database/index';
import { hasToolPermission } from '../capabilities/catalog';
import { createMicroErpReadModel } from './read-model';
import { topUpActiveAgentContract } from '../agents/top-up-agent-contract';

const listCompanyCashInputSchema = z.object({
  direction: z.enum(['in', 'out']).optional(),
  status: z.enum(['planned', 'posted', 'canceled']).optional(),
  type: z.string().optional(),
  periodStart: z.number().int().optional(),
  periodEnd: z.number().int().optional(),
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
      execute: async () => microErp.getCompanyCashBalance(),
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_company_cash')) {
    tools.list_company_cash = createTool({
      id: 'list_company_cash',
      description: 'List company cash ledger movements and return the cash summary for the selected period.',
      inputSchema: listCompanyCashInputSchema,
      execute: async (input) => microErp.listCompanyCashMovements(input),
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_internal_agent_contracts')) {
    tools.list_internal_agent_contracts = createTool({
      id: 'list_internal_agent_contracts',
      description: 'List active internal-agent contracts.',
      inputSchema: z.object({}),
      execute: async () => microErp.listActiveInternalAgentContracts(),
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
      execute: async (input) => topUpActiveAgentContract(db, {
        agentId: input.agentId,
        amountUsd: input.amountUsd,
      }),
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
