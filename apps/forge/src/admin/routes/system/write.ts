/**
 * System Admin Write Routes - Phase 4 of #719
 * POST routes that perform system-level operations extracted from routes.ts
 */

import { syncOpenAICodexCredential, syncAnthropicCredential } from '@forge-runtime/core';

import { forgeDebug } from '../debug';
import { buildOauthState } from './oauth-state';
import { eq } from 'drizzle-orm';
import { adminRouteError, safeRoute } from '../agents/admin-route-error-helper';
import { jsonResponse, adminRoutesParseJsonBody, normalizeOptionalText, normalizeJsonText } from '../helpers';
import { upsertSystemSettingsSchema, upsertLlmModelPriceSchema } from '../schemas/llm';
import { upsertSystemMcpServerSchema, deleteSystemMcpServerSchema } from '../schemas/mcp';
import { uploadSystemSkillsSchema, deleteSystemSkillSchema } from '../schemas/skills';
import { upsertSystemIntegrationSchema, deleteSystemIntegrationSchema } from '../schemas/providers';
import {
  upsertLlmProfileSchema,
  deleteLlmProfileSchema,
  updateLlmDefaultsSchema,
} from '../schemas/llm';
import { syncOauthSchema } from '../schemas/oauth';
import { factoryResetSchema } from '../schemas/system';
import { performFactoryReset } from '../../../system/reset';
import { fixupColumnsHandler } from './fixup-columns';
import type { Database } from '../../../database/client';
import { mcpServerConfigs, agentMcpConfigs } from '../../../database/schema';
import { installGlobalSkillsFromZip, deleteGlobalSkill } from '../../../agents/global-skills';
import type { AgentLoaderConfig } from '../../../agents/agent-loader';
import { createForgeHttpServer } from '../../../http/server';
import type { SystemSettingsStore } from '../../../system-settings/store';
import type { LlmSettingsStore } from '../../../llm/settings-store';
import type { LlmModelPriceStore } from '../../../llm/model-price-store';
import { createSystemIntegrationStore } from '../../../system-integrations/store';
import { getInternalAgentRegistry } from '../../../agents/internal-agent-registry';
import { loadAgent } from '../../../agents/agent-loader';

interface SystemWriteRoutesInput {
  httpServer: ReturnType<typeof createForgeHttpServer>;
  db: Database;
  workspaceBasePath: string;
  loaderConfig: AgentLoaderConfig;
  systemSettings: SystemSettingsStore;
  llmSettings: LlmSettingsStore;
  llmModelPrices: LlmModelPriceStore;
  integrations: ReturnType<typeof createSystemIntegrationStore>;
  registry: ReturnType<typeof getInternalAgentRegistry>;
  loadAgent: typeof loadAgent;
  /**
   * Admin API key used to authenticate destructive routes that live outside
   * the /admin/* prefix (e.g. POST /system/reset, re-pathed D49 PR-A per #6521).
   * When undefined, the route returns 503 unless allowInsecureLocal is true.
   * Mirrors the auth check at apps/forge/src/http/server.ts:270-287 for
   * /admin/* paths, applied at route level instead of path prefix.
   */
  adminApiKey?: string;
  /** When true, destructive routes without adminApiKey still respond (local dev only). */
  allowInsecureLocal?: boolean;
}
import { errorMsg } from '../../../agents/error-formatting';
import { verifyAdminApiKey } from '../../../http/admin-auth';

export function registerSystemWriteRoutes(input: SystemWriteRoutesInput) {
  const {
    httpServer,
    db,
    workspaceBasePath,
    loaderConfig,
    systemSettings,
    llmSettings,
    llmModelPrices,
    integrations,
    registry,
    loadAgent: loadAgentFn,
    adminApiKey,
    allowInsecureLocal,
  } = input;

  // Route-level auth via shared verifyAdminApiKey helper (#6528).
  // /system/reset was re-pathed outside /admin/* in D49 #6521, so it no longer
  // inherits the server-level path-prefix middleware. This call mirrors the
  // auth check at apps/forge/src/http/server.ts — now via the same helper.

  // POST /admin/system/settings/upsert
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/settings/upsert',
    handler: safeRoute('/admin/system/settings/upsert', async (request) => {
        const body = adminRoutesParseJsonBody(request.bodyText, upsertSystemSettingsSchema);
        const result = await systemSettings.upsertSettings(
          body as Parameters<typeof systemSettings.upsertSettings>[0],
        );

        for (const entry of registry.list()) {
          const agentEntry = registry.get(entry.id);
          if (!agentEntry?.runtime) continue;
          await registry.add(db, agentEntry.runtime);
        }

        return jsonResponse(result);
    }),
  });

  // POST /admin/system/mcp/upsert
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/mcp/upsert',
    handler: safeRoute('/admin/system/mcp/upsert', async (request) => {
        const body = adminRoutesParseJsonBody(request.bodyText, upsertSystemMcpServerSchema);
        const serverId = body.serverId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const values = {
          name: body.name,
          description: normalizeOptionalText(body.description),
          transport: body.transport,
          command: body.transport === 'stdio' ? body.command : null,
          args:
            body.transport === 'stdio'
              ? normalizeJsonText(body.argsText, 'argsText', 'array')
              : null,
          envVars:
            body.transport === 'stdio'
              ? normalizeJsonText(body.envVarsText, 'envVarsText', 'object')
              : null,
          url: body.transport === 'http_streamable' ? body.url : null,
          headers:
            body.transport === 'http_streamable'
              ? normalizeJsonText(body.headersText, 'headersText', 'object')
              : null,
          isActive: body.isActive ? 1 : 0,
          updatedAt: Date.now(),
        };

        if (body.serverId !== null && body.serverId !== undefined) {
          await db
            .update(mcpServerConfigs)
            .set(values)
            .where(eq(mcpServerConfigs.id, body.serverId));
        } else {
          await db.insert(mcpServerConfigs).values({
            id: serverId,
            ...values,
            version: 1,
            createdAt: Date.now(),
          });
        }

        const linkedConfigs = await db.query.agentMcpConfigs.findMany({
          where: eq(agentMcpConfigs.serverId, serverId),
          columns: { agentId: true },
        });
        for (const linkedConfig of linkedConfigs) {
          const runtime = await loadAgentFn(db, { ...loaderConfig, agentId: linkedConfig.agentId });
          await registry.add(db, runtime);
        }

        const server = await db.query.mcpServerConfigs.findFirst({
          where: eq(mcpServerConfigs.id, serverId),
        });

        return jsonResponse({
          serverId,
          name: server?.name ?? body.name,
          description: server?.description ?? undefined,
          transport: (server?.transport ?? body.transport) as 'stdio' | 'http_streamable',
          command: server?.command ?? '',
          argsText: server?.args ?? '',
          envVarsText: server?.envVars ?? '',
          url: server?.url ?? '',
          headersText: server?.headers ?? '',
          isActive: (server?.isActive ?? (body.isActive ? 1 : 0)) === 1,
          createdAt: server?.createdAt ?? Date.now(),
          updatedAt: server?.updatedAt ?? Date.now(),
        });
    }),
  });

  // POST /admin/system/mcp/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/mcp/delete',
    handler: safeRoute('/admin/system/mcp/delete', async (request) => {
        const body = adminRoutesParseJsonBody(request.bodyText, deleteSystemMcpServerSchema);
        const linkedConfigs = await db.query.agentMcpConfigs.findMany({
          where: eq(agentMcpConfigs.serverId, body.serverId),
          columns: { agentId: true, id: true },
        });

        for (const linkedConfig of linkedConfigs) {
          await db.delete(agentMcpConfigs).where(eq(agentMcpConfigs.id, linkedConfig.id));
          const runtime = await loadAgentFn(db, { ...loaderConfig, agentId: linkedConfig.agentId });
          await registry.add(db, runtime);
        }

        await db.delete(mcpServerConfigs).where(eq(mcpServerConfigs.id, body.serverId));

        return jsonResponse({ success: true, serverId: body.serverId });
    }),
  });

  // POST /admin/system/skills/upload
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/skills/upload',
    handler: safeRoute('/admin/system/skills/upload', async (request) => {
        const body = adminRoutesParseJsonBody(request.bodyText, uploadSystemSkillsSchema);
        const installedSkillNames = await installGlobalSkillsFromZip({
          workspaceBasePath,
          zipBase64: body.archiveBase64,
        });
        return jsonResponse({ success: true, installedSkillNames }, 201);
    }),
  });

  // POST /admin/system/skills/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/skills/delete',
    handler: safeRoute('/admin/system/skills/delete', async (request) => {
        const body = adminRoutesParseJsonBody(request.bodyText, deleteSystemSkillSchema);
        await deleteGlobalSkill({
          workspaceBasePath,
          skillName: body.skillName,
        });
        return jsonResponse({ success: true, skillName: body.skillName });
    }),
  });

  // POST /admin/system/llm/price/upsert
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/llm/price/upsert',
    handler: safeRoute('/admin/system/llm/price/upsert', async (request) => {
        const body = adminRoutesParseJsonBody(request.bodyText, upsertLlmModelPriceSchema);
        return jsonResponse(await llmModelPrices.upsertPrice(body));
    }),
  });

  // POST /admin/system/integration/upsert
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/integration/upsert',
    handler: safeRoute('/admin/system/integration/upsert', async (request) => {
        const body = adminRoutesParseJsonBody(request.bodyText, upsertSystemIntegrationSchema);
        return jsonResponse(await integrations.upsertIntegration(body));
    }),
  });

  // POST /admin/system/integration/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/integration/delete',
    handler: safeRoute('/admin/system/integration/delete', async (request) => {
        const body = adminRoutesParseJsonBody(request.bodyText, deleteSystemIntegrationSchema);
        await integrations.deleteIntegration(body.providerType);
        return jsonResponse({ success: true, integrationId: body.integrationId });
    }),
  });

  // POST /admin/system/llm/profile/upsert
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/llm/profile/upsert',
    handler: safeRoute('/admin/system/llm/profile/upsert', async (request) => {
        const body = adminRoutesParseJsonBody(request.bodyText, upsertLlmProfileSchema);
        return jsonResponse(await llmSettings.upsertProfile(body));
    }),
  });

  // POST /admin/system/llm/profile/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/llm/profile/delete',
    handler: safeRoute('/admin/system/llm/profile/delete', async (request) => {
        const body = adminRoutesParseJsonBody(request.bodyText, deleteLlmProfileSchema);
        await llmSettings.deleteProfile(body.profileId);
        return jsonResponse({ success: true, profileId: body.profileId });
    }),
  });

  // POST /admin/system/llm/defaults/update
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/llm/defaults/update',
    handler: safeRoute('/admin/system/llm/defaults/update', async (request) => {
        const body = adminRoutesParseJsonBody(request.bodyText, updateLlmDefaultsSchema);
        return jsonResponse(await llmSettings.updateDefaults(body));
    }),
  });

  // POST /admin/system/oauth/sync
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/oauth/sync',
    handler: async (request) => {
      try {
        const body = adminRoutesParseJsonBody(request.bodyText, syncOauthSchema);
        const providerIds: Array<'openai-codex' | 'anthropic'> =
          body.provider === 'all' ? ['openai-codex', 'anthropic'] : [body.provider];
        const results: Array<{
          providerId: 'openai-codex' | 'anthropic';
          synced: boolean;
          error?: string;
        }> = [];

        for (const providerId of providerIds) {
          // Per-item catch: preserves partial-success semantics (one provider may fail
          // while others succeed). adminRouteError would short-circuit with 500,
          // killing the batch. See adminRouteError JSDoc for full rationale.
          try {
            if (providerId === 'openai-codex') {
              await syncOpenAICodexCredential();
            } else {
              await syncAnthropicCredential();
            }
            results.push({ providerId, synced: true });
          } catch (err) {
            forgeDebug({
              scope: 'admin',
              level: 'error',
              message: 'LLM provider sync failed',
              context: { error: errorMsg(err) },
            });
            results.push({
              providerId,
              synced: false,
              error: errorMsg(err),
            });
          }
        }

        return jsonResponse({ state: await buildOauthState(), results });
      } catch (err) {
        return adminRouteError(err, { path: '/admin/system/oauth/sync' });
        }
    },
  });

  // ==========================================================================
  // FACTORY RESET (#5679 PR-A, #6521 D49 PR-A re-path + auth fix)
  // ==========================================================================
  //
  // POST /system/reset  (D49 re-path: removed /admin/ prefix per #6521 spec)
  //   Body: { "confirm": "FACTORY_RESET" }
  //   Auth: route-level verifyAdminApiKey() helper — admin API key required
  //         because the route moved out of /admin/* (which the server-level
  //         path-prefix middleware protects). Veritas P0 catch (D49 06:43Z
  //         reviewId 4958047572) confirmed that path-based admin middleware
  //         no longer covers this route. D49 #6528 extracted the previously
  //         inlined check into a shared helper at http/admin-auth.ts,
  //         mirroring server.ts:282-297 logic (no more duplication).
  //   Defense-in-depth (still active): z.literal("FACTORY_RESET") + DB snapshot
  //         + forgeDebug audit log with backupPath + wipedTables.
  //   Effect: backup DB to /tmp/forge-factory-reset-{ISO}.db, then wipe
  //           all user-data tables (LLM, agents, settings, schedules,
  //           internal-chat, webhooks). Schema preserved.
  // ==========================================================================
  httpServer.registerRoute({
    method: 'POST',
    path: '/system/reset',
    handler: safeRoute('/system/reset', async (request) => {
        const denied = verifyAdminApiKey(request.headers, adminApiKey, allowInsecureLocal === true);
        if (denied !== null) {
          return jsonResponse(denied.body, denied.status);
        }
        const { confirm: _confirm } = adminRoutesParseJsonBody(request.bodyText, factoryResetSchema);
        // _confirm === "FACTORY_RESET" guaranteed by z.literal
        const result = await performFactoryReset();
        return jsonResponse(result);
    }),
  });

  // ==========================================================================
  // FIXUP COLUMNS (#6722 D56 Sprint 0 retry)
  // ==========================================================================
  //
  // POST /admin/system/fixup-columns
  //   Auth: admin (server-level path-prefix middleware enforces x-forge-admin-api-key)
  //   Body: none
  //   Effect: idempotent full fixup of system_settings.created_at drift:
  //           - DELETE wrong journal hash (66ab7767...)
  //           - ALTER TABLE ADD COLUMN if missing (idempotent: skipped if present)
  //           - INSERT correct journal hash for migration 0031
  //           See also: cleanupFixupJournalEntry() in apps/forge/src/database/migrate.ts
  //           (runs on every startup, BEFORE the migration loop, to defuse the
  //           time-bomb from PR #6723).
  // ==========================================================================
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/fixup-columns',
    handler: safeRoute('/admin/system/fixup-columns', async () => await fixupColumnsHandler(db)),
  });

}
