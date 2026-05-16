import { forgeDebug } from '@forge-runtime/core';

import type {Database} from '../database/schema';
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
  runner: InternalAgentRunner;
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
  let loaderConfig: (Omit<AgentLoaderConfig, "emailMailboxes" | "coolify" | "githubApps"> & {
    httpServer: Parameters<typeof createGitHubAppManager>[0]["httpServer"];
    publicBaseUrl: string;
    integrations: Parameters<typeof createGitHubAppManager>[0]["integrations"];
  }) | null = null;

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
    };
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

  async function add(db: Database, runtime: InternalAgentRuntime, config?: typeof loaderConfig) {
    const existingAgent = agents.get(runtime.id);
    const pendingWakeEvents = existingAgent
      ? [
          ...existingAgent.runner.getSnapshot().wake.events,
          ...existingAgent.runner.getSnapshot().pendingRunEvents,
        ]
      : [];

    // Each running agent gets its own fresh managers — lifetime matched to this agent.
    const emailMailboxes = createPerAgentEmailManager(db);
    const coolify = createPerAgentCoolifyManager(db);
    const githubApps = createPerAgentGitHubManager({
      db,
      httpServer: loaderConfig?.httpServer,
      integrations: loaderConfig?.integrations,
    });

    const entry = {
      runtime,
      runner: null as InternalAgentRunner | null,
    };

    const runner = createAgentRunner(db, runtime, {
      workspaceBasePath: loaderConfig?.workspaceBasePath,
      reloadRuntime: async () => {
        if (!loaderConfig) {
          forgeDebug({ scope: 'internal-agent-registry', level: 'error', message: 'internal-agent-registry: validation/requirement failed' });
          throw new Error('Agent loader config is not available for runtime reload');
        }
        const reloadEmailMailboxes = createPerAgentEmailManager(db);
        const reloadCoolify = createPerAgentCoolifyManager(db);
        const reloadGitHubApps = createPerAgentGitHubManager({
          db,
          httpServer: loaderConfig!.httpServer,
          integrations: loaderConfig!.integrations,
        });
        // eslint-disable-next-line @typescript-eslint/return-await
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
      },
    });

    entry.runner = runner;
    const nextEntry = entry as InternalAgentEntry;

    try {
      await runner.start();
      agents.set(runtime.id, nextEntry);

      for (const event of pendingWakeEvents) {
        nextEntry.runner.notifyExternalEvent(event);
      }

      if (existingAgent) {
        existingAgent.runner.stop();
        await existingAgent.runtime.dispose();
      }

      return nextEntry;
    } catch (error) {
      runner.stop();
      await runtime.dispose().catch((disposeError) => {
        forgeDebug({ scope: 'internal-agent-registry', level: 'error', message: 'Failed to dispose replacement runtime', context: { runtimeId: runtime.id, error: disposeError } });
      });
      throw error;
    }
  }

  function remove(agentId: string) {
    const agent = agents.get(agentId);

    if (!agent) {
      return;
    }

    agent.runner.stop();
    void agent.runtime.dispose().catch((error) => {
      forgeDebug({ scope: 'internal-agent-registry', level: 'error', message: 'Failed to dispose runtime', context: { agentId, error } });
    });

    agents.delete(agentId);
  }

  function get(agentId: string) {
    return agents.get(agentId) ?? null;
  }

  function list() {
    return Array.from(agents.values());
  }

  return {
    loadAll,
    add,
    remove,
    get,
    list,
  };
}

export function getInternalAgentRegistry() {
  return internalAgentRegistry;
}

export type Registry = ReturnType<typeof createInternalAgentRegistry>;
export type InternalAgentRegistry = Registry;

const internalAgentRegistry = createInternalAgentRegistry();