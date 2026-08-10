import 'dotenv/config';
import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from './agents/error-formatting';
import { z } from 'zod';

import { getDatabase } from './database/client';
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

const envSchema = z.object({
  FORGE_DATA_PATH: z.string().default('./data'),
  WORKSPACE_BASE_PATH: z.string().default('./workspaces'),
  FORGE_HTTP_PORT: z.coerce.number().int().positive().default(3011),
  FORGE_PUBLIC_BASE_URL: z.string().url().optional(),
  FORGE_ADMIN_API_KEY: z.string().min(1).optional(),
  FORGE_ADMIN_ALLOW_INSECURE_LOCAL: z.enum(['true', '1']).optional(),
  FORGE_ADMIN_ALLOWED_ORIGINS: z.string().optional(),
});

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
  const env = envSchema.parse(process.env);
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
    throw new Error(
      'FORGE_ADMIN_API_KEY is not configured. Set it in your environment or set' +
        ' FORGE_ADMIN_ALLOW_INSECURE_LOCAL=true for local development only.',
    );
  }

  const db = getDatabase();
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
  try {
    await prepareAgentEmbeddersForStartup({
      db,
      workspaceBasePath: env.WORKSPACE_BASE_PATH,
    });
  } catch (err) {
    bootstrapDebug('warn', 'bootstrap: prepareAgentEmbeddersForStartup FAILED (continuing)', { error: errorMsg(err) });
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

  const integrations = createSystemIntegrationStore(db);
  const internalChat = createInternalChatService(db);
  const agentContracts = createAgentContractStore(db);
  bootstrapDebug('info', 'bootstrap: stores created');

  const coolifyManager = createCoolifyManager({ integrations });
  const minimaxManager = createMiniMaxManager({ integrations });
  const githubApps = createGitHubAppManager({ db, httpServer, integrations });
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
          idempotencyKey: scheduleId,
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
    // AdminRouteContext requires loaderConfig and emailMailboxes, but
    // forge-bootstrap does not construct them at this layer — they live in
    // the per-agent runtime via the registry. The affected routes are only
    // invoked after the registry wires up loaderConfig per agent. Pass
    // them as undefined casts for now; tracked as a follow-up to thread
    // the loader config through bootstrap.
    loaderConfig: undefined as never,
    emailMailboxes: undefined as never,
  });

  const publicBaseUrl = env.FORGE_PUBLIC_BASE_URL ?? `http://localhost:${env.FORGE_HTTP_PORT}`;
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
