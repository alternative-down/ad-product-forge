import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
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

const agentIdQuerySchema = z.object({
  agentId: z.string().min(1),
});

const roleToolPermissionSchema = z.object({
  roleId: z.string().min(1),
  toolId: z.string().min(1),
});

const roleWorkflowPermissionSchema = z.object({
  roleId: z.string().min(1),
  workflowId: z.string().min(1),
});

const createRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const updateRoleSchema = z.object({
  roleId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
});

const deleteRoleSchema = z.object({
  roleId: z.string().min(1),
});

const createFunctionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const updateFunctionSchema = z.object({
  functionId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
});

const deleteFunctionSchema = z.object({
  functionId: z.string().min(1),
});

const functionRoleSchema = z.object({
  functionId: z.string().min(1),
  roleId: z.string().min(1),
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
  workspaceAutoSync: z.boolean(),
  workspaceBm25: z.boolean(),
  workspaceEmbedder: z.string().min(1),
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
  });
  const capabilities = createCapabilityStore(input.db);
  const integrations = input.integrations;
  const llmSettings = createLlmSettingsStore(input.db);
  const llmModelPrices = createLlmModelPriceStore(input.db);
  const registry = getInternalAgentRegistry();
  const companyCash = createCompanyCashOperations(input.db);
  const companyPayables = createCompanyPayables(input.db);

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/overview',
    handler: async () => jsonResponse(await readModel.getDashboard()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents',
    handler: async () => jsonResponse(await readModel.listAgents()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent',
    handler: async (request) => {
      const { agentId } = agentIdQuerySchema.parse({
        agentId: request.query.get('agentId'),
      });
      const agent = await readModel.getAgent(agentId);

      if (!agent) {
        return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
      }

      return jsonResponse(agent);
    },
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/functions',
    handler: async () => jsonResponse(await readModel.listFunctions()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/roles',
    handler: async () => jsonResponse(await readModel.listRoles()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/integrations',
    handler: async () => jsonResponse(await readModel.listSystemIntegrations()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/llm',
    handler: async () => jsonResponse(await readModel.getSystemLlm()),
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/llm/price/upsert',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, upsertLlmModelPriceSchema);
      return jsonResponse(await llmModelPrices.upsertPrice(body));
    },
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/oauth',
    handler: async () => jsonResponse(readOauthState()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance',
    handler: async () => jsonResponse(await readModel.getFinance()),
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/wake',
    handler: async (request) => {
      const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
      const entry = registry.get(agentId);

      if (!entry) {
        return jsonResponse({ error: `Loaded agent not found: ${agentId}` }, 404);
      }

      entry.runner.notifyExternalEvent();
      return jsonResponse({ success: true });
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/reload',
    handler: async (request) => {
      const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
      const runtime = await loadAgent(input.db, {
        ...input.loaderConfig,
        agentId,
      });
      await registry.add(input.db, runtime);

      return jsonResponse({ success: true, agentId });
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/hire',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, hireAgentSchema);
      const result = await runInternalHiring(input.db, {
        hiringRequest: body.hiringRequest,
        additionalContext: body.additionalContext,
        weeklyBudgetUsd: body.weeklyBudgetUsd,
        workspaceBasePath: input.workspaceBasePath,
        workflows: input.loaderConfig.workflows,
        githubApps: input.githubApps,
        emailMailboxes: input.emailMailboxes,
        coolify: input.coolify,
        schedules: input.schedules,
      });

      return jsonResponse(result, 201);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/terminate',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, terminateAgentSchema);
      const result = await runInternalTermination(input.db, {
        agentId: body.agentId,
        workspaceBasePath: input.workspaceBasePath,
        githubApps: input.githubApps,
        emailMailboxes: input.emailMailboxes,
        schedules: input.schedules,
      });

      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/change-function',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, changeAgentFunctionSchema);
      const result = await changeAgentFunctionFromAdmin({
        db: input.db,
        loaderConfig: input.loaderConfig,
        targetAgentId: body.agentId,
        functionId: body.functionId,
      });

      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/update-config',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateAgentConfigSchema);
      const agent = await input.db.query.agents.findFirst({
        where: eq(agents.id, body.agentId),
      });

      if (!agent) {
        return jsonResponse({ error: `Agent not found: ${body.agentId}` }, 404);
      }

      await input.db
        .update(agents)
        .set({
          name: body.name,
          description: body.description ?? null,
          workspaceAutoSync: body.workspaceAutoSync ? 1 : 0,
          workspaceBm25: body.workspaceBm25 ? 1 : 0,
          workspaceEmbedder: body.workspaceEmbedder,
          updatedAt: Date.now(),
        })
        .where(eq(agents.id, body.agentId));

      const agentFunction = agent.functionId
        ? await input.db.query.agentFunctions.findFirst({
            where: eq(agentFunctions.id, agent.functionId),
          })
        : null;

      await updateInternalChatProviderProfile(input.db, {
        agentId: body.agentId,
        displayName: body.name,
        description: agentFunction?.description ?? agentFunction?.name ?? body.name,
      });

      await reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);

      return jsonResponse({ success: true, agentId: body.agentId });
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-provider/upsert',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, upsertAgentProviderSchema);
      const credentials = parseProviderCredentials(body.providerType, body.credentials);
      const encryptedCredentials = encryptSecret(JSON.stringify(credentials));
      const existing = await input.db.query.agentProviders.findFirst({
        where: and(
          eq(agentProviders.agentId, body.agentId),
          eq(agentProviders.providerType, body.providerType),
        ),
      });

      if (existing) {
        await input.db
          .update(agentProviders)
          .set({
            encryptedCredentials,
          })
          .where(eq(agentProviders.id, existing.id));
      } else {
        await input.db.insert(agentProviders).values({
          id: createId(),
          agentId: body.agentId,
          providerType: body.providerType,
          encryptedCredentials,
          createdAt: Date.now(),
        });
      }

      await reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);

      return jsonResponse({ success: true, agentId: body.agentId, providerType: body.providerType });
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-provider/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteAgentProviderSchema);

      await input.db
        .delete(agentProviders)
        .where(
          and(
            eq(agentProviders.agentId, body.agentId),
            eq(agentProviders.providerType, body.providerType),
          ),
        );

      await reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);

      return jsonResponse({ success: true, agentId: body.agentId, providerType: body.providerType });
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-schedule/create',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, createScheduleSchema);
      const schedule = await input.schedules.createSchedule(body.agentId, body);
      return jsonResponse(schedule, 201);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-schedule/update',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateScheduleSchema);
      const schedule = await input.schedules.updateSchedule(body.agentId, body.scheduleId, {
        name: body.name,
        description: body.description,
        scheduleType: body.scheduleType,
        cronExpression: body.cronExpression,
        scheduledDate: body.scheduledDate,
        timezone: body.timezone,
        content: body.content,
        isActive: body.isActive,
      });
      return jsonResponse(schedule);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-schedule/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteScheduleSchema);
      const result = await input.schedules.deleteSchedule(body.agentId, body.scheduleId);
      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role/create',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, createRoleSchema);
      return jsonResponse(await capabilities.createRole(body), 201);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role/update',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateRoleSchema);
      const result = await capabilities.updateRole(body);
      await reloadAgentsForRole(input.db, input.loaderConfig, body.roleId);
      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteRoleSchema);
      return jsonResponse(await capabilities.deleteRole(body.roleId));
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/function/create',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, createFunctionSchema);
      return jsonResponse(await capabilities.createFunction(body), 201);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/function/update',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateFunctionSchema);
      const result = await capabilities.updateFunction(body);
      await reloadAgentsForFunction(input.db, input.loaderConfig, body.functionId);
      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/function/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteFunctionSchema);
      return jsonResponse(await capabilities.deleteFunction(body.functionId));
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/function-role/add',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, functionRoleSchema);
      const result = await capabilities.addRoleToFunction(body);

      void reloadAgentsForFunction(input.db, input.loaderConfig, body.functionId).catch((error) => {
        console.error(`[Admin] Failed to reload agents for function ${body.functionId}:`, error);
      });
      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/function-role/remove',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, functionRoleSchema);
      const result = await capabilities.removeRoleFromFunction(body);

      void reloadAgentsForFunction(input.db, input.loaderConfig, body.functionId).catch((error) => {
        console.error(`[Admin] Failed to reload agents for function ${body.functionId}:`, error);
      });
      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-tool-permission/add',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, roleToolPermissionSchema);
      const result = await capabilities.addRoleToolPermission(body);
      await reloadAgentsForRole(input.db, input.loaderConfig, body.roleId);
      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-workflow-permission/add',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, roleWorkflowPermissionSchema);
      const result = await capabilities.addRoleWorkflowPermission(body);
      await reloadAgentsForRole(input.db, input.loaderConfig, body.roleId);
      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-workflow-permission/remove',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, roleWorkflowPermissionSchema);
      const result = await capabilities.removeRoleWorkflowPermission(body);
      await reloadAgentsForRole(input.db, input.loaderConfig, body.roleId);
      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-tool-permission/remove',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, roleToolPermissionSchema);
      const result = await capabilities.removeRoleToolPermission(body);
      await reloadAgentsForRole(input.db, input.loaderConfig, body.roleId);
      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/integration/upsert',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, upsertSystemIntegrationSchema);
      const result = await integrations.upsertIntegration(body);

      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/integration/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteSystemIntegrationSchema);
      await integrations.deleteIntegration(body.providerType);
      return jsonResponse({ success: true, providerType: body.providerType });
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/llm/profile/upsert',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, upsertLlmProfileSchema);
      return jsonResponse(await llmSettings.upsertProfile(body));
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/llm/profile/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteLlmProfileSchema);
      await llmSettings.deleteProfile(body.profileId);
      return jsonResponse({ success: true, profileId: body.profileId });
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/llm/defaults/update',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateLlmDefaultsSchema);
      return jsonResponse(await llmSettings.updateDefaults(body));
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/oauth/sync',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, syncOauthSchema);
      const providerIds: Array<'openai-codex' | 'anthropic'> =
        body.providerId === 'all' ? ['openai-codex', 'anthropic'] : [body.providerId];
      const results: Array<{
        providerId: 'openai-codex' | 'anthropic';
        synced: boolean;
        error?: string;
      }> = [];

      for (const providerId of providerIds) {
        try {
          if (providerId === 'openai-codex') {
            await syncOpenAICodexCredential();
          } else {
            await syncAnthropicCredential();
          }

          results.push({
            providerId,
            synced: true,
          });
        } catch (error) {
          results.push({
            providerId,
            synced: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return jsonResponse({
        state: readOauthState(),
        results,
      });
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/investment/create',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, createInvestmentSchema);
      const effectiveAt = body.effectiveAt ? new Date(body.effectiveAt).getTime() : Date.now();

      await companyCash.recordCashIn({
        type: 'owner-investment',
        amountUsd: body.amountUsd,
        description: body.description ?? 'Manual owner investment',
        effectiveAt,
      });

      return jsonResponse({ success: true });
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/payable/create',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, createPayableSchema);
      const dueAt = new Date(body.dueAt).getTime();

      if (!Number.isFinite(dueAt)) {
        throw new Error('Invalid payable dueAt');
      }

      if (body.kind === 'single') {
        const result = await companyCash.scheduleCashOut({
          type: 'manual-payable',
          amountUsd: body.amountUsd,
          description: body.description ?? body.name,
          referenceType: 'manual-payable',
          referenceId: createId(),
          dueAt,
        });

        return jsonResponse({
          kind: body.kind,
          entryId: result.entryId,
        }, 201);
      }

      const result = await companyPayables.createRecurringPayable({
        name: body.name,
        description: body.description,
        amountUsd: body.amountUsd,
        recurrencePeriod: body.recurrencePeriod,
        dueAt,
      });

      return jsonResponse({
        kind: body.kind,
        payableId: result.payableId,
        entryId: result.entryId,
      }, 201);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/ledger/post',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, ledgerEntryActionSchema);
      const effectiveAt = body.effectiveAt ? new Date(body.effectiveAt).getTime() : undefined;
      const result = await companyCash.postPlannedEntry(body.entryId, { effectiveAt });

      await companyPayables.syncRecurringPayableOccurrence({
        entryId: body.entryId,
      });

      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/ledger/cancel',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, ledgerEntryActionSchema);
      const result = await companyCash.cancelPlannedEntry(body.entryId);

      await companyPayables.syncRecurringPayableOccurrence({
        entryId: body.entryId,
      });

      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/recurring-payable/set-active',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, recurringPayableStatusSchema);
      const result = await companyPayables.setRecurringPayableActive(body.payableId, body.isActive);
      return jsonResponse(result);
    },
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
