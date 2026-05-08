import { readFile } from 'node:fs/promises';
import 'node:process';
import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';


import type {Database} from '../database/schema';
import { createMicroErpReadModel } from '../micro-erp/read-model';
import { createCompanyPayables } from '../finance/company-payables';
import { createCapabilityStore } from '../capabilities/store';
import { createLlmSettingsStore } from '../llm/settings-store';
import { createLlmModelPriceStore } from '../llm/model-price-store';
import { createAgentNotificationStore } from '../notifications/store';
import { createSystemIntegrationStore } from '../system-integrations/store';
import { createSystemSettingsStore } from '../system-settings/store';
import { createAgentReadModel } from './read-model/agents';
import { createSystemReadModel } from './read-model/system';
import { createFinanceReadModel } from './read-model/finance';
import { getFinanceOverview } from './read-model/finance-overview';
import { getRecurringPayables } from './read-model/payables-overview';
import { forgeDebug } from '@forge-runtime/core';
import type { GitHubAppManager } from '../github/manager';
import type { InternalChatService } from '../communication/internal-chat-service';

export function createAdminReadModel(input: {
  db: Database;
  workspaceBasePath: string;
  githubApps: GitHubAppManager;
  internalChat: InternalChatService;
}) {
  const db = input.db;

  // Shared stores
  const finance = createMicroErpReadModel(db);
  const payables = createCompanyPayables(db);
  const capabilities = createCapabilityStore(db);
  const llmSettings = createLlmSettingsStore(db);
  const notifications = createAgentNotificationStore(db);
  const integrations = createSystemIntegrationStore(db);
  const llmModelPrices = createLlmModelPriceStore(db);
  const systemSettings = createSystemSettingsStore(db);

  // Domain read-model submodules
  const agentRM = createAgentReadModel({
    db,
    capabilities,
    llmSettings,
    finance,
    notifications,
    internalChat: input.internalChat,
    workspaceBasePath: input.workspaceBasePath,
    githubApps: input.githubApps,
    systemSettings,
  });

  const systemRM = createSystemReadModel({ db });
  const financeRM = createFinanceReadModel({ db });

  async function getApplicationMigrations() {
    try {
      const journalPath = resolve(process.cwd(), 'migrations/meta/_journal.json');
      const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
        entries: Array<{
          idx: number;
          when: number;
          tag: string;
        }>;
      };
      const appliedRows = await db.all<{
        id: number;
        hash: string;
        createdAt: number;
      }>(sql`
        select
          id,
          hash,
          created_at as createdAt
        from __drizzle_migrations
        order by created_at asc
      `);
      const appliedByCreatedAt = new Map(appliedRows.map((row) => [Number(row.createdAt), row]));

      return {
        applied: appliedRows,
        entries: journal.entries.map((entry) => {
          const applied = appliedByCreatedAt.get(entry.when);

          return {
            idx: entry.idx,
            tag: entry.tag,
            createdAt: entry.when,
            applied: Boolean(applied),
            hash: applied?.hash ?? null,
            rowId: applied?.id ?? null,
          };
        }),
      };
    } catch (err) {
      forgeDebug({ scope: 'admin-readmodel', level: 'error', message: '[admin-readmodel] getApplicationMigrations failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  return {
    getDashboard: agentRM.getDashboard,
    listAgents: agentRM.listAgents,
    getAgent: agentRM.getAgent,
    listAgentRecentConversations: agentRM.listAgentRecentConversations,
    listAgentExecutionSteps: agentRM.listAgentExecutionSteps,
    listAgentThreadMessages: agentRM.listAgentThreadMessages,
    listAgentLongTermMemoryThreadMessages: agentRM.listAgentLongTermMemoryThreadMessages,
    listRecentAgentHomeMetricSnapshots: agentRM.listRecentAgentHomeMetricSnapshots,
    getAgentRuntimeMemory: agentRM.getAgentRuntimeMemory,
    getAgentOmDebugExport: agentRM.getAgentOmDebugExport,
    debugAgentLongTermMemoryRecallSearch: agentRM.debugAgentLongTermMemoryRecallSearch,
    listAgentConversationMessages: agentRM.listAgentConversationMessages,
    listRoles: systemRM.listRoles,
    listSystemIntegrations: systemRM.listSystemIntegrations,
    getSystemLlm: systemRM.getSystemLlm,
    getSystemSettings: systemRM.getSystemSettings,
    getApplicationMigrations,
    getFinance: async () => {
      const [overview, recurringPayables] = await Promise.all([
        getFinanceOverview(finance),
        getRecurringPayables(payables),
      ]);

      return {
        ...overview,
        recurringPayables,
      };
    },
    getFinanceContracts: financeRM.getFinanceContracts,
  };
}
