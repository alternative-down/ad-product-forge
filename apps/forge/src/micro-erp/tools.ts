import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import type { Database } from '../database/index';
import { createMicroErpReadModel } from './read-model';

const listCompanyCashMovementsInputSchema = z.object({
  direction: z.enum(['in', 'out']).optional(),
  status: z.enum(['planned', 'posted', 'canceled']).optional(),
  type: z.string().optional(),
  periodStart: z.number().int().optional(),
  periodEnd: z.number().int().optional(),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

const getCompanyCashSummaryInputSchema = z.object({
  periodStart: z.number().int().optional(),
  periodEnd: z.number().int().optional(),
});

const getActiveInternalAgentContractInputSchema = z.object({
  agentId: z.string().min(1),
});

function canCreateTool(allowedToolIds: Set<string> | null | undefined, toolId: string) {
  return !allowedToolIds || allowedToolIds.has(toolId);
}

export function createMicroErpTools(db: Database, allowedToolIds?: Set<string> | null) {
  const microErp = createMicroErpReadModel(db);
  const tools: Record<string, unknown> = {};

  if (canCreateTool(allowedToolIds, 'get_company_cash_balance')) {
    tools.get_company_cash_balance = createTool({
      id: 'get_company_cash_balance',
      description: 'Return the current company cash balance derived from the financial ledger.',
      inputSchema: z.object({}),
      execute: async () => microErp.getCompanyCashBalance(),
    });
  }

  if (canCreateTool(allowedToolIds, 'list_company_cash_movements')) {
    tools.list_company_cash_movements = createTool({
      id: 'list_company_cash_movements',
      description: 'List company cash ledger movements with optional period, type, direction, and status filters.',
      inputSchema: listCompanyCashMovementsInputSchema,
      execute: async (input) => microErp.listCompanyCashMovements(input),
    });
  }

  if (canCreateTool(allowedToolIds, 'get_company_cash_summary')) {
    tools.get_company_cash_summary = createTool({
      id: 'get_company_cash_summary',
      description: 'Return a cash summary for a period, including posted totals, scheduled totals, and current balance.',
      inputSchema: getCompanyCashSummaryInputSchema,
      execute: async (input) => microErp.getCompanyCashSummary(input),
    });
  }

  if (canCreateTool(allowedToolIds, 'list_active_internal_agent_contracts')) {
    tools.list_active_internal_agent_contracts = createTool({
      id: 'list_active_internal_agent_contracts',
      description: 'List active internal-agent contracts with their weekly contract values.',
      inputSchema: z.object({}),
      execute: async () => microErp.listActiveInternalAgentContracts(),
    });
  }

  if (canCreateTool(allowedToolIds, 'get_active_internal_agent_contract')) {
    tools.get_active_internal_agent_contract = createTool({
      id: 'get_active_internal_agent_contract',
      description: 'Return the active contract for one internal agent.',
      inputSchema: getActiveInternalAgentContractInputSchema,
      execute: async (input) => microErp.getActiveInternalAgentContract(input.agentId),
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
