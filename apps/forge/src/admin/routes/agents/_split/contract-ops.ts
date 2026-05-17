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

export function registerContractOps({ httpServer, db, ops }: ContractOpsDeps) {
  // POST /admin/agent/contract/top-up
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/contract/top-up',
    handler: async (request: { bodyText: string }) => {
      try {
        const body = parseJsonBody(request.bodyText, topUpAgentContractSchema);
        return jsonResponse(await ops.topUpActiveAgentContract(db, body));
      } catch (err) {
        forgeDebug({ scope: "admin", level: "error", message: "/admin/agent/contract/top-up", context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });

  // POST /admin/agent/contract/adjust-budget
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/contract/adjust-budget',
    handler: async (request: { bodyText: string }) => {
      try {
        const body = parseJsonBody(request.bodyText, adjustAgentContractBudgetSchema);
        return jsonResponse(await ops.adjustAgentContractBudget(db, body));
      } catch (err) {
        forgeDebug({ scope: "admin", level: "error", message: "/admin/agent/contract/adjust-budget", context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });

  // POST /admin/agent/contract/renew
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/contract/renew',
    handler: async (request: { bodyText: string }) => {
      try {
        const body = parseJsonBody(request.bodyText, renewAgentContractSchema);
        return jsonResponse(await ops.renewAgentContract(db, body));
      } catch (err) {
        forgeDebug({ scope: "admin", level: "error", message: "/admin/agent/contract/renew", context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });
}