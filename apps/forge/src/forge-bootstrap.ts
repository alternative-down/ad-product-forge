import 'dotenv/config';
import { ForgeAdminApiKeyNotConfiguredError } from './forge-bootstrap.errors';
import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from './agents/error-formatting';
import { parseEnv } from './config/env';

import { configureDatabaseConnection, getDatabase } from './database/client';
import { runMigrations } from './database/migrate';
import { getInternalAgentRegistry } from './agents/internal-agent-registry';
import { createForgeHttpServer } from './http/server';
import { createGitHubAppManager } from './github/manager';
import { createCoolifyManager } from './coolify/manager';
import { createMiniMaxManager } from './minimax/manager';
import { createAgentScheduleManager } from './schedules/manager/index';
import { registerAdminRoutes } from './admin/routes';
import { createAdminReadModel } from './admin/read-model';
import { createSystemIntegrationStore } from './system-integrations/store';
import { createInternalChatService } from './communication/internal-chat-service';
import { createAgentContractStore } from './agents/agent-contract-store';
import { prepareAgentEmbeddersForStartup } from './agents/agent-embedder-maintenance';
import type { AgentLoaderConfig } from './agents/agent-loader-types';
/**
 * Module-local debug helper. Centralizes the forge-bootstrap scope
 * so call sites only specify the level, message, and context.
 */
function bootstrapDebug(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
) {
  forgeDebug({ scope: 'forge-bootstrap', level, message, context });
}

/**
 * Always-emit startup log. Unlike forgeDebug, this writes to console.log
 * regardless of FORGE_DEBUG environment variable. This is a FAILSAFE for
 * diagnosing startup crashes in production where Coolify container logs
 * are not easily accessible without SSH.
 *
 * See L#NN-Startup-Logging-Failsafe v1 (cycle 14c-3).
 */
function consoleStartupLog(message: string, context?: Record<string, unknown>): void {
  if (context && Object.keys(context).length > 0) {
    console.log(`[forge-startup] ${message}`, JSON.stringify(context));
  } else {
    console.log(`[forge-startup] ${message}`);
  }
}

/**
 * Decode a Base64-encoded admin API key.
 *
 * Allows keys with special characters (e.g., `$`, `#`, `!`, `\`) to be stored
 * in environment variables safely by Base64-encoding the raw key.
 *
 * Detection logic:
 *   1. If the value is a valid Base64 string (alphanumeric + / + =)
 *      AND decoding produces valid printable UTF-8 output,
 *      the decoded value is used.
 *   2. Otherwise the raw value is returned as-is (backward compatibility).
 *
 * This means:
 *   - Plain ASCII keys like `simple-key` or `abc123` work as-is (no change needed)
 *   - Keys with special chars like `my$ecret!key#123` should be Base64-encoded:
 *       bXkkZWNyZXQha2V5IzEyMw==
 *   - The `$` in the key prevents it from being valid Base64, so the raw value
 *     would be returned by an old server — but since we now always trim empty to
 *     undefined, having a key with `$` in the env without encoding would fail
 *     auth (server gets raw `$` value). Users must Base64-encode keys with
 *     characters outside printable ASCII.
 *
 * Example:
 *   Raw key:    my$ecret!key#123
 *   Base64 env: bXkkZWNyZXQha2V5IzEyMw==
 */
function decodeAdminApiKey(rawValue: string | undefined): string | undefined {
  if (rawValue === undefined || rawValue === null) return undefined;

  const trimmed = rawValue.trim();
  if (trimmed === '') return undefined;

  if (/^[A-Za-z0-9+/]+=*$/.test(trimmed)) {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');

    if (/^[\x20-\x7E]*$/.test(decoded)) {
      return decoded;
    }
  }

  return rawValue;
}

/**
 * Normalise value — trim empty strings to undefined.
 * Returns the fully wired application context ready for routes registration.
 */
export async function createForgeBootstrap() {
  consoleStartupLog('starting');
  bootstrapDebug('info', 'bootstrap: starting');
  const env = parseEnv();
  consoleStartupLog('env parsed', {
    port: env.FORGE_HTTP_PORT,
    dataPath: env.FORGE_DATA_PATH,
    workspaceBasePath: env.WORKSPACE_BASE_PATH,
    publicBaseUrl: env.FORGE_PUBLIC_BASE_URL,
    adminApiKeyConfigured: env.FORGE_ADMIN_API_KEY !== undefined,
    allowInsecureLocal: env.FORGE_ADMIN_ALLOW_INSECURE_LOCAL,
  });
  bootstrapDebug('info', 'bootstrap: env parsed', {
    port: env.FORGE_HTTP_PORT,
    dataPath: env.FORGE_DATA_PATH,
    workspaceBasePath: env.WORKSPACE_BASE_PATH,
    adminApiKeyConfigured: env.FORGE_ADMIN_API_KEY !== undefined,
    allowInsecureLocal: env.FORGE_ADMIN_ALLOW_INSECURE_LOCAL,
  });

  const adminApiKey = decodeAdminApiKey(env.FORGE_ADMIN_API_KEY);
  const allowInsecureLocal =
    env.FORGE_ADMIN_ALLOW_INSECURE_LOCAL === 'true' || env.FORGE_ADMIN_ALLOW_INSECURE_LOCAL === '1';
  const allowedOrigins =
    env.FORGE_ADMIN_ALLOWED_ORIGINS !== null && env.FORGE_ADMIN_ALLOWED_ORIGINS !== undefined
      ? env.FORGE_ADMIN_ALLOWED_ORIGINS.split(',')
          .map((o) => o.trim())
          .filter(Boolean)
      : undefined;

  if (adminApiKey === undefined && !allowInsecureLocal) {
    consoleStartupLog('CONFIGURATION CHECK FAILED: FORGE_ADMIN_API_KEY not configured');
    forgeDebug({ scope: 'main', level: 'error', message: 'main: configuration check failed' });
    throw new ForgeAdminApiKeyNotConfiguredError();
  }

  const db = getDatabase();
  consoleStartupLog('configuring database connection');
  bootstrapDebug('info', 'bootstrap: configuring database connection');
  await configureDatabaseConnection();
  consoleStartupLog('db obtained, running migrations');
  bootstrapDebug('info', 'bootstrap: db obtained, running migrations');
  try {
    await runMigrations(db);
    consoleStartupLog('migrations complete');
  } catch (err) {
    consoleStartupLog('MIGRATIONS FAILED', { error: errorMsg(err) });
    bootstrapDebug('error', 'bootstrap: runMigrations FAILED', { error: errorMsg(err) });
    throw err;
  }
  bootstrapDebug('info', 'bootstrap: migrations complete');
  // runMigrations repairs system_settings.created_at drift before deciding
  // which journal entries can be skipped. The manual admin endpoint remains
  // available for operator verification and remediation.
  try {
    await prepareAgentEmbeddersForStartup({
      db,
      workspaceBasePath: env.WORKSPACE_BASE_PATH,
    });
  } catch (err) {
    bootstrapDebug('warn', 'bootstrap: prepareAgentEmbeddersForStartup FAILED (continuing)', {
      error: errorMsg(err),
    });
  }
  bootstrapDebug('info', 'bootstrap: agent embedders ready');

  const registry = getInternalAgentRegistry();
  bootstrapDebug('info', 'bootstrap: registry obtained');
  const httpServer = createForgeHttpServer({
    port: env.FORGE_HTTP_PORT,
    adminApiKey,
    allowInsecureLocal,
    allowedOrigins,
  });
  await httpServer.start();
  consoleStartupLog('HTTP server listening for startup health checks', {
    port: env.FORGE_HTTP_PORT,
  });
  bootstrapDebug('info', 'bootstrap: startup health server ready', {
    port: env.FORGE_HTTP_PORT,
  });

  const integrations = createSystemIntegrationStore(db);
  const internalChat = createInternalChatService(db);
  const agentContracts = createAgentContractStore(db);
  bootstrapDebug('info', 'bootstrap: stores created');

  const coolifyManager = createCoolifyManager({ integrations });
  const minimaxManager = createMiniMaxManager({ integrations });
  const publicBaseUrl = env.FORGE_PUBLIC_BASE_URL ?? `http://localhost:${env.FORGE_HTTP_PORT}`;
  const githubApps = createGitHubAppManager({ db, httpServer, integrations, publicBaseUrl });
  bootstrapDebug('info', 'bootstrap: managers created');

  // Scheduler for admin operations (route handlers, tool delegation).
  // Per-agent schedulers are created inside internal-agent-registry via
  // createPerAgentScheduleManager() — one per agent with callbacks to that
  // agent's runner. The global scheduler is NOT passed to the registry.
  const schedules = createAgentScheduleManager({
    db,
    getAgentExecutionState: (agentId) => {
      const entry = registry.get(agentId);
      if (!entry) return Promise.resolve('absent');
      // runner has no public execution state query, default to 'idle' when runner exists
      return Promise.resolve('idle');
    },
    notifyAgent: ({
      agentId,
      scheduleId,
      scheduleKind: _sKind,
      scheduleName: _sName,
      content: msg,
      timestamp,
      idleOnly,
    }) => {
      const entry = registry.get(agentId);
      if (entry) {
        entry.runner?.notifyExternalEvent({
          type: 'schedule:trigger',
          groupKey: agentId,
          idempotencyKey: `${scheduleId}:${timestamp}`,
          timestamp,
          text: msg,
          idleOnly,
        });
      }
    },
  });
  bootstrapDebug('info', 'bootstrap: schedule manager created');

  const readModel = createAdminReadModel({
    db,
    workspaceBasePath: env.WORKSPACE_BASE_PATH,
    githubApps,
    internalChat,
  });

  const loaderConfig: AgentLoaderConfig = {
    workspaceBasePath: env.WORKSPACE_BASE_PATH,
    githubApps,
    emailMailboxes: null,
    coolify: coolifyManager,
    minimax: minimaxManager,
    schedules,
    internalChat,
  };

  bootstrapDebug('info', 'bootstrap: read model created');
  registerAdminRoutes({
    httpServer,
    integrations,
    githubApps,
    coolify: coolifyManager,
    schedules,
    db,
    workspaceBasePath: env.WORKSPACE_BASE_PATH,
    internalChat,
    loaderConfig,
    emailMailboxes: loaderConfig.emailMailboxes,
    // Admin API key + insecure-local flag for destructive routes outside /admin/*
    // (e.g. POST /system/reset, re-pathed D49 PR-A per #6521). Same semantics
    // as the server-level path-prefix auth at http/server.ts:270-287.
    adminApiKey,
    allowInsecureLocal,
  });

  consoleStartupLog('admin routes ready; loading agents from database');
  const loadedAgents = await registry.loadAll(db, {
    ...loaderConfig,
    publicBaseUrl,
    httpServer,
    integrations,
  });
  await schedules.ensureHeartbeatSchedules(loadedAgents.map(({ id }) => id));
  await schedules.loadAll();
  bootstrapDebug('info', 'bootstrap: active schedules loaded');
  consoleStartupLog('agents loaded', { agentCount: registry.size });
  bootstrapDebug('info', 'bootstrap: agents loaded', { agentCount: registry.size });

  bootstrapDebug('info', 'bootstrap: bootstrap COMPLETE', { publicBaseUrl });

  return {
    httpServer,
    readModel,
    integrations,
    githubApps,
    coolifyManager,
    minimaxManager,
    agentContracts,
    schedules,
    db,
    registry,
    internalChat,
    adminApiKey,
    publicBaseUrl,
    allowInsecureLocal,
  };
}
