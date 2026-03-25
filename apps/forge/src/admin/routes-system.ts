import { z } from 'zod';
import type { Database } from '~/lib/db';
import type { AgentLoaderConfig } from '~/lib/loader';
import type { HttpServer } from '~/lib/http-server';
import type { AdminReadModel } from './read-model';
import { parseJsonBody, jsonResponse } from '~/lib/http';
import { loadAgent, getInternalAgentRegistry } from '~/capabilities/runtime';
import { syncOpenAICodexCredential, syncAnthropicCredential } from '@mastra-engine/core';

// Schemas
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
  providerType: z.enum(['migadu', 'coolify', 'github']),
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

export function registerSystemRoutes(input: {
  db: Database;
  httpServer: HttpServer;
  loaderConfig: AgentLoaderConfig;
  readModel: AdminReadModel;
  integrations: {
    upsertIntegration: (data: z.infer<typeof upsertSystemIntegrationSchema>) => Promise<unknown>;
    deleteIntegration: (providerType: string) => Promise<void>;
  };
  llmSettings: {
    upsertProfile: (data: z.infer<typeof upsertLlmProfileSchema>) => Promise<unknown>;
    deleteProfile: (profileId: string) => Promise<void>;
    updateDefaults: (data: z.infer<typeof updateLlmDefaultsSchema>) => Promise<unknown>;
  };
  llmModelPrices: {
    upsertPrice: (data: z.infer<typeof upsertLlmModelPriceSchema>) => Promise<unknown>;
  };
  systemSettings: {
    upsertSettings: (data: z.infer<typeof upsertSystemSettingsSchema>) => Promise<unknown>;
  };
}) {
  const { integrations, llmSettings, llmModelPrices, systemSettings, readModel } = input;

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/integrations',
    handler: async () => jsonResponse(await readModel.listSystemIntegrations()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/settings',
    handler: async () => jsonResponse(await readModel.getSystemSettings()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/llm',
    handler: async () => jsonResponse(await readModel.getSystemLlm()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/migrations',
    handler: async () => jsonResponse(await readModel.getApplicationMigrations()),
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/settings/upsert',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, upsertSystemSettingsSchema);
      const result = await systemSettings.upsertSettings({
        companyName: body.companyName.trim(),
        companyContext: body.companyContext.trim(),
      });
      const registry = getInternalAgentRegistry();

      for (const entry of registry.list()) {
        const runtime = await loadAgent(input.db, {
          ...input.loaderConfig,
          agentId: entry.runtime.id,
        });

        await registry.add(input.db, runtime);
      }

      return jsonResponse(result);
    },
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
    handler: async () => jsonResponse({}),
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

      return jsonResponse({ results });
    },
  });
}
