/**
 * Agent Contract Operations — Group 2 of 4
 * Routes: /admin/agent/contract/top-up, /admin/agent/contract/adjust-budget, /admin/agent/contract/renew
 * Split from write-ops.ts (#2180)
 */

import { adminRoutesParseJsonBody, jsonResponse } from '../../index';
import { safeRoute } from '../admin-route-error-helper';

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
    handler: safeRoute('/admin/agent/contract/top-up', async (request: { bodyText: string }) => {
      const body = adminRoutesParseJsonBody(request.bodyText, topUpAgentContractSchema);
      return jsonResponse(await ops.topUpActiveAgentContract(db, body));
    
}),
  });

  // POST /admin/agent/contract/adjust-budget
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/contract/adjust-budget',
    handler: safeRoute('/admin/agent/contract/adjust-budget', async (request: { bodyText: string }) => {
      const body = adminRoutesParseJsonBody(request.bodyText, adjustAgentContractBudgetSchema);
      return jsonResponse(await ops.adjustAgentContractBudget(db, body));
    
}),
  });

  // POST /admin/agent/contract/renew
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/contract/renew',
    handler: safeRoute('/admin/agent/contract/renew', async (request: { bodyText: string }) => {
      const body = adminRoutesParseJsonBody(request.bodyText, renewAgentContractSchema);
      return jsonResponse(await ops.renewAgentContract(db, body));
    
}),
  });
}
