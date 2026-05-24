/**
 * Agent Contract Operations — Group 2 of 4
 * Routes: /admin/agent/contract/top-up, /admin/agent/contract/adjust-budget, /admin/agent/contract/renew
 * Split from write-ops.ts (#2180)
 */

import { parseJsonBody, jsonResponse } from '../../index';
import { forgeDebug } from '../../debug';
import {
  topUpAgentContractSchema,
  adjustAgentContractBudgetSchema,
  renewAgentContractSchema,
} from '../../schemas/agents';

export interface ContractOpsDeps {
  httpServer: { registerRoute: (route: object) => void };
  db: unknown;
  ops: {
    topUpActiveAgentContract: (db: unknown, body: unknown) => Promise<unknown>;
    adjustAgentContractBudget: (db: unknown, body: unknown) => Promise<unknown>;
    renewAgentContract: (db: unknown, body: unknown) => Promise<unknown>;
  };
}

import { errorMsg } from '../../../../agents/agent-runner-error-formatting';