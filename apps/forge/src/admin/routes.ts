import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { registerAgentRoutes } from './routes-agents';
import { registerFunctionRoutes } from './routes-functions';
import { registerRoleRoutes } from './routes-roles';
import { registerCapabilityRoutes } from './routes-capabilities';
import { registerSystemRoutes } from './routes-system';
import { registerFinanceRoutes } from './routes-finance';
import fs from 'node:fs';
import {
  getAnthropicCliAuthFilePath,
  getAnthropicSetupTokenFilePath,
  getOpenAICodexCliAuthFilePath,
  oauthStore,
  syncAnthropicCredential,
  syncOpenAICodexCredential,
} from '@mastra-engine/core';

import type { Database } from '../database/index';
import type { AgentLoaderConfig } from '../agents/agent-loader';
import { loadAgent } from '../agents/agent-loader';
import { getInternalAgentRegistry } from '../agents/internal-agent-registry';
import { createCapabilityStore } from '../capabilities/store';
import {
  changeAgentFunctionFromAdmin,
  reloadAgentIfLoaded,
  reloadAgentsForFunction,
  reloadAgentsForRole,
  updateInternalChatProviderProfile,
} from '../capabilities/runtime';
import type { createForgeHttpServer } from '../http/server';
import type { createAgentScheduleManager } from '../schedules/manager';
import { createAdminReadModel } from './read-model';
import { runInternalHiring, runInternalTermination } from '../agents/internal-agent-lifecycle';
import type { AgentEmailManager } from '../email/migadu-manager';
import type { CoolifyManager } from '../coolify/manager';
import type { GitHubAppManager } from '../github/manager';
import { agentFunctions, agents, agentProviders } from '../database/schema';
import { encryptSecret } from '../encryption/crypto';
import { parseProviderCredentials } from '../communication/provider-loader';
import { createId } from '@paralleldrive/cuid2';
import { createSystemIntegrationStore } from '../system-integrations/store';
import { createCompanyCashOperations } from '../finance/company-cash-operations';
import { createCompanyPayables } from '../finance/company-payables';
import { createLlmSettingsStore } from '../llm/settings-store';
import { createLlmModelPriceStore } from '../llm/model-price-store';
import { topUpActiveAgentContract } from '../agents/top-up-agent-contract';
import { createSystemSettingsStore } from '../system-settings/store';

const agentIdQuerySchema = z.object({
  agentId: z.string().min(1),
});

const createScheduleSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  scheduleType: z.enum(['cron', 'date']),
  cronExpression: z.string().min(1).optional(),
  scheduledDate: z.string().min(1).optional(),
  timezone: z.string().min(1).default('UTC'),
  content: z.string().min(1),
});

const updateScheduleSchema = z.object({
  agentId: z.string().min(1),
  scheduleId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  scheduleType: z.enum(['cron', 'date']).optional(),
  cronExpression: z.string().min(1).optional().nullable(),
  scheduledDate: z.string().min(1).optional().nullable(),
  timezone: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

const deleteScheduleSchema = z.object({
  agentId: z.string().min(1),
  scheduleId: z.string().min(1),
});

const agentActionSchema = z.object({
  agentId: z.string().min(1),
});

const topUpAgentContractSchema = z.object({
  agentId: z.string().min(1),
  amountUsd: z.coerce.number().positive(),
});

const hireAgentSchema = z.object({
  hiringRequest: z.string().min(1),
  additionalContext: z.string().optional(),
  weeklyBudgetUsd: z.coerce.number().positive(),
});

const terminateAgentSchema = z.object({
  agentId: z.string().min(1),
});

const changeAgentFunctionSchema = z.object({
  agentId: z.string().min(1),
  functionId: z.string().min(1),
});

const updateAgentConfigSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  instructions: z.string().min(1),
  workspaceAutoSync: z.boolean(),
  workspaceBm25: z.boolean(),
  modelProfileId: z.string().min(1),
  omModelProfileId: z.string().min(1),
});

const upsertAgentProviderSchema = z.object({
  agentId: z.string().min(1),
  providerType: z.enum(['discord', 'email']),
  credentials: z.unknown(),
});

const deleteAgentProviderSchema = z.object({
  agentId: z.string().min(1),
  providerType: z.enum(['discord', 'email']),
});

const systemIntegrationProviderSchema = z.enum(['migadu', 'coolify', 'github']);

const upsertSystemIntegrationSchema = z.discriminatedUnion('providerType', [
  z.object({
    providerType: z.literal('migadu'),
    isEnabled: z.boolean().default(true),
    config: z.object({
      apiUser: z.string().email(),
      apiKey: z.string().min(1),
    }),
  }),
  z.object({
    providerType: z.literal('coolify'),
    isEnabled: z.boolean().default(true),
    config: z.object({
      baseUrl: z.string().url(),
      adminToken: z.string().min(1),
      applicationsBaseDomain: z.string().min(1).optional(),
    }),
  }),
  z.object({
    providerType: z.literal('github'),
    isEnabled: z.boolean().default(true),
    config: z.object({
      organization: z.string().min(1),
      appHomeUrl: z.string().url(),
    }),
  }),
]);

const deleteSystemIntegrationSchema = z.object({
  providerType: systemIntegrationProviderSchema,
});

const upsertLlmProfileSchema = z.object({
  profileId: z.string().min(1).optional(),
  name: z.string().min(1),
  modelKey: z.string().min(1),
  baseUrl: z.string().url().optional().nullable(),
  apiKey: z.string().min(1),
  contractCostMultiplier: z.coerce.number().positive().default(1),
  isEnabled: z.boolean().default(true),
});

const deleteLlmProfileSchema = z.object({
  profileId: z.string().min(1),
});

const updateLlmDefaultsSchema = z.object({
  primaryProfileId: z.string().min(1),
  omProfileId: z.string().min(1),
  hiringRhProfileId: z.string().min(1),
});

const upsertLlmModelPriceSchema = z.object({
  modelKey: z.string().min(1),
  inputPerMillionUsd: z.coerce.number().nonnegative(),
  inputCachePerMillionUsd: z.coerce.number().nonnegative(),
  outputPerMillionUsd: z.coerce.number().nonnegative(),
});

const upsertSystemSettingsSchema = z.object({
  companyName: z.string(),
  companyContext: z.string(),
});

const oauthSyncProviderSchema = z.enum(['openai-codex', 'anthropic', 'all']);

const syncOauthSchema = z.object({
  providerId: oauthSyncProviderSchema.default('all'),
});

const createInvestmentSchema = z.object({
  amountUsd: z.coerce.number().positive(),
  description: z.string().optional(),
  effectiveAt: z.string().optional(),
});

const createPayableSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('single'),
    name: z.string().min(1),
    description: z.string().optional(),
    amountUsd: z.coerce.number().positive(),
    dueAt: z.string().min(1),
  }),
  z.object({
    kind: z.literal('recurring'),
    name: z.string().min(1),
    description: z.string().optional(),
    amountUsd: z.coerce.number().positive(),
    dueAt: z.string().min(1),
    recurrencePeriod: z.enum(['weekly', 'monthly', 'yearly']),
  }),
]);

const ledgerEntryActionSchema = z.object({
  entryId: z.string().min(1),
  effectiveAt: z.string().optional(),
});

const recurringPayableStatusSchema = z.object({
  payableId: z.string().min(1),
  isActive: z.boolean(),
});

export function registerAdminRoutes(input: {
  db: Database;
  httpServer: ReturnType<typeof createForgeHttpServer>;
  loaderConfig: AgentLoaderConfig;
  schedules: ReturnType<typeof createAgentScheduleManager>;
  workspaceBasePath: string;
  githubApps: GitHubAppManager;
  emailMailboxes: AgentEmailManager | null;
  coolify: CoolifyManager | null;
  integrations: ReturnType<typeof createSystemIntegrationStore>;
}) {
  const readModel = createAdminReadModel({
    db: input.db,
    workspaceBasePath: input.workspaceBasePath,
    githubApps: input.githubApps,
  });
  const capabilities = createCapabilityStore(input.db);
  const integrations = input.integrations;
  const llmSettings = createLlmSettingsStore(input.db);
  const llmModelPrices = createLlmModelPriceStore(input.db);
  const systemSettings = createSystemSettingsStore(input.db);
  const registry = getInternalAgentRegistry();
  const companyCash = createCompanyCashOperations(input.db);
  const companyPayables = createCompanyPayables(input.db);

  // Agent routes — extracted to routes-agents.ts
  registerAgentRoutes(input);

  // Function routes — extracted to routes-functions.ts
  registerFunctionRoutes(input, readModel);

  // Role routes — extracted to routes-roles.ts
  registerRoleRoutes(input, readModel);

  // Capability routes — extracted to routes-capabilities.ts
  registerCapabilityRoutes(input);

  // System routes — extracted to routes-system.ts
  registerSystemRoutes({
    db: input.db,
    httpServer: input.httpServer,
    loaderConfig: input.loaderConfig,
    readModel,
    integrations,
    llmSettings,
    llmModelPrices,
    systemSettings,
  });

  registerFinanceRoutes({
    db: input.db,
    httpServer: input.httpServer,
    readModel,
    companyCash,
    companyPayables,
  });
}

function parseJsonBody<TSchema extends z.ZodTypeAny>(
  bodyText: string,
  schema: TSchema,
): z.infer<TSchema> {
  const parsed = bodyText.trim().length === 0 ? {} : JSON.parse(bodyText);
  return schema.parse(parsed);
}

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function readOauthState() {
  const storePath = oauthStore.getDefaultPath();
  const store = oauthStore.read(storePath);
  const openAICodexPath = getOpenAICodexCliAuthFilePath();
  const anthropicSetupTokenPath = getAnthropicSetupTokenFilePath();
  const anthropicCliPath = getAnthropicCliAuthFilePath();

  return {
    storePath,
    providers: [
      {
        providerId: 'openai-codex' as const,
        sourcePath: openAICodexPath,
        sourcePresent: fs.existsSync(openAICodexPath),
        synced: Boolean(store['openai-codex']),
        hasRefresh: Boolean(store['openai-codex']?.refresh),
        expiresAt: store['openai-codex']?.expires ?? null,
        accountId: store['openai-codex']?.accountId ?? null,
      },
      {
        providerId: 'anthropic' as const,
        sourcePath: `${anthropicSetupTokenPath} or ${anthropicCliPath}`,
        sourcePresent: fs.existsSync(anthropicSetupTokenPath) || fs.existsSync(anthropicCliPath),
        synced: Boolean(store.anthropic),
        hasRefresh: Boolean(store.anthropic?.refresh),
        expiresAt: store.anthropic?.expires ?? null,
        accountId: store.anthropic?.accountId ?? null,
      },
    ],
  };
}
