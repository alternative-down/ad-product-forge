import { forgeDebug, type AgentWakeEvent } from '@forge-runtime/core';

import type { Database } from '../database/schema';
import type { AgentLoaderConfig } from './agent-loader';
import type { InternalAgentRuntime } from './runtime/types';
import { createAgentRunner, type InternalAgentRunner } from './agent-runner';
import { loadAgents, loadAgent } from './agent-loader';
import { createSystemIntegrationStore } from '../system-integrations/store';
import { createAgentEmailManager, type AgentEmailManager } from '../email/migadu-manager';
import { createCoolifyManager, type CoolifyManager } from '../coolify/manager';
import { createGitHubAppManager } from '../github/manager';

type InternalAgentEntry = {
  runtime: InternalAgentRuntime;
  runner: InternalAgentRunner | null;
};

/**
 * Subset of AgentLoaderConfig that loadAgents actually needs.
 * loadAgents only reads workspaceBasePath, minimax, schedules, internalChat,
 * and passes everything to loadAgent which reconstructs the full config.
 */

/**
 * Extended config that includes GitHub-specific fields needed for per-agent manager creation.
 * These are not part of AgentLoaderConfig but are passed to createGitHubAppManager.
 */
type GitHubManagerConfig = {
  httpServer: Parameters<typeof createGitHubAppManager>[0]['httpServer'];
  integrations: Parameters<typeof createGitHubAppManager>[0]['integrations'];
};

/**
 * Creates a per-agent AgentEmailManager instance.
 * Call this for each agent to get an isolated email manager.
 * Exported so callers (admin routes, hire/terminate) can create per-agent managers
 * instead of sharing a single global instance.
 */
export function createPerAgentEmailManager(db: Database): AgentEmailManager {
  const integrations = createSystemIntegrationStore(db);
  return createAgentEmailManager({ db, integrations });
}

/**
 * Creates a per-agent CoolifyManager instance.
 * Call this for each agent to get an isolated Coolify manager.
 */
function createPerAgentCoolifyManager(db: Database): CoolifyManager {
  const integrations = createSystemIntegrationStore(db);
  return createCoolifyManager({ integrations });
}
/**
 * Creates a per-agent GitHubAppManager instance.
 * Each agent gets its own isolated manager with:
 * - Fresh notifications store (agent-scoped events)
 * - Fresh routeCleanups map (no route conflicts between agents)
 * - Shared global state: db, httpServer, publicBaseUrl, integrations
 */
export function createPerAgentGitHubManager(config: {
  db: Database;
  httpServer: Parameters<typeof createGitHubAppManager>[0]['httpServer'];
  publicBaseUrl: string;
  integrations: Parameters<typeof createGitHubAppManager>[0]['integrations'];
}) {
  return createGitHubAppManager(config);
}

function createInternalAgentRegistry() {
  const agents = new Map<string, InternalAgentEntry>();
  let loaderConfig: (AgentLoaderConfig & Partial<GitHubManagerConfig>) | null = null;

  async function loadAll(db: Database, config: AgentLoaderConfig) {
    loaderConfig = config;
    const existingAgentIds = new Set(agents.keys());

    // loadAgents returns runtimes — pass a config WITHOUT coolify/emailMailboxes
    // so loadAgents does not attach any manager. We attach per-agent managers
    // in the loop below.
    const cleanConfig = {
      workspaceBasePath: config.workspaceBasePath,
      minimax: config.minimax,
      schedules: config.schedules,
      internalChat: config.internalChat,
      // intentionally omitted: emailMailboxes, coolify, githubApps
    } as unknown as AgentLoaderConfig;
    const runtimes = await loadAgents(db, cleanConfig);

    for (const runtime of runtimes.values()) {
      await add(db, runtime, config);
      existingAgentIds.delete(runtime.id);
    }

    for (const agentId of existingAgentIds) {
      remove(agentId);
    }

    return list();
  }

  function add(db: Database, runtime: InternalAgentRuntime, _config?: typeof loaderConfig) {
    const existingAgent = agents.get(runtime.id);
    const pendingWakeEvents: AgentWakeEvent[] = existingAgent
      ? [
          ...((existingAgent.runner?.getSnapshot()?.wake.events ?? []) as AgentWakeEvent[]),
          ...((existingAgent.runner?.getSnapshot()?.pendingRunEvents ?? []) as AgentWakeEvent[]),
        ]
      : [];

    // Each running agent gets its own fresh managers — lifetime matched to this agent.
    const _emailMailboxes = createPerAgentEmailManager(db);
    const _coolify = createPerAgentCoolifyManager(db);
    const _githubApps = createPerAgentGitHubManager({
      db,
      // httpServer and integrations may not be set — guard with nullish coalescing
      // These fields are optional on the extended config type
      httpServer:
        (loaderConfig as AgentLoaderConfig & GitHubManagerConfig)?.httpServer ?? (null as never),
      integrations:
        (loaderConfig as AgentLoaderConfig & GitHubManagerConfig)?.integrations ?? (null as never),
      publicBaseUrl: '',
    });

    const entry: InternalAgentEntry = {
      runtime,
      runner: null as InternalAgentRunner | null,
    };

    const runner = createAgentRunner(db, runtime, {
      workspaceBasePath: loaderConfig?.workspaceBasePath,
      reloadRuntime: async () => {
        if (!loaderConfig) {
          forgeDebug({
            scope: 'internal-agent-registry',
            level: 'error',
            message: 'internal-agent-registry: validation/requirement failed',
          });
          throw new Error('Agent loader config is not available for runtime reload');
        }
        const reloadEmailMailboxes = createPerAgentEmailManager(db);
        const reloadCoolify = createPerAgentCoolifyManager(db);
        const reloadGitHubApps = createPerAgentGitHubManager({
          db,
          // Inside the null-check, loaderConfig is guaranteed non-null
          httpServer: (loaderConfig as AgentLoaderConfig & GitHubManagerConfig).httpServer,
          integrations: (loaderConfig as AgentLoaderConfig & GitHubManagerConfig).integrations,
          publicBaseUrl: '',
        });

        return await loadAgent(db, {
          ...loaderConfig,
          emailMailboxes: reloadEmailMailboxes,
          coolify: reloadCoolify,
          githubApps: reloadGitHubApps,
          agentId: runtime.id,
        });
      },
      onRuntimeReloaded: (nextRuntime) => {
        entry.runtime = nextRuntime;
        agents.set(runtime.id, { ...entry, runtime: nextRuntime });
      },
    });

    // Resume any pending wake events from before the last reload
    for (const wakeEvent of pendingWakeEvents) {
      runner.notifyExternalEvent(wakeEvent);
    }

    entry.runner = runner;
    agents.set(runtime.id, entry);
  }

  function remove(agentId: string) {
    const entry = agents.get(agentId);
    if (!entry) return;
    entry.runner?.stop();
    agents.delete(agentId);
  }

  function get(agentId: string): InternalAgentEntry | undefined {
    return agents.get(agentId);
  }

  function list(): Array<{ id: string; status: string }> {
    return Array.from(agents.entries()).map(([id, entry]) => ({
      id,
      status: entry.runner ? 'running' : 'stopped',
    }));
  }

  return {
    loadAll,
    add,
    remove,
    get,
    list,

    get size(): number {
      return agents.size;
    },
  };
}

export function getInternalAgentRegistry() {
  return internalAgentRegistry;
}

export type Registry = ReturnType<typeof createInternalAgentRegistry>;
export type InternalAgentRegistry = Registry;

const internalAgentRegistry = createInternalAgentRegistry();
