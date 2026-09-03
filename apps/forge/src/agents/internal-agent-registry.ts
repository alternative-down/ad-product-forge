import { forgeDebug, type AgentWakeEvent } from '@forge-runtime/core';
import { InternalAgentRegistryReloadConfigError } from './internal-agent-registry.errors';

import type { Database } from '../database/client';
import type { AgentLoaderConfig } from './agent-loader';
import type { InternalAgentRuntime } from './runtime/types';
import { createAgentRunner, type InternalAgentRunner } from './agent-runner';
import { loadAgents, loadAgent } from './agent-loader';
import { createSystemIntegrationStore } from '../system-integrations/store';
import { createAgentEmailManager, type AgentEmailManager } from '../email/migadu-manager';
import { createCoolifyManager, type CoolifyManager } from '../coolify/manager';
import { createGitHubAppManager } from '../github/manager';
import { delay } from '../utils/async';
import { FIVE_SECONDS_MS } from './time-constants';

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
  publicBaseUrl: string;
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


function createInternalAgentRegistry() {
  const agents = new Map<string, InternalAgentEntry>();
  let loaderConfig: (AgentLoaderConfig & GitHubManagerConfig) | null = null;
  let memoryRecoveryGeneration = 0;

  async function loadAll(db: Database, config: AgentLoaderConfig & GitHubManagerConfig) {
    loaderConfig = config;
    const existingAgentIds = new Set(agents.keys());

    // loadAgents returns runtimes — pass a config WITHOUT coolify/emailMailboxes
    // so loadAgents does not attach any manager. We attach per-agent managers
    // in the loop below. Pass through the unused fields (loadAgents doesn't
    // touch them) to satisfy the AgentLoaderConfig shape without an unsafe cast.
    const cleanConfig: AgentLoaderConfig = {
      workspaceBasePath: config.workspaceBasePath,
      minimax: config.minimax,
      schedules: config.schedules,
      internalChat: config.internalChat,
      githubApps: config.githubApps,
      emailMailboxes: config.emailMailboxes,
      coolify: config.coolify,
    };
    const runtimes = await loadAgents(db, cleanConfig);

    for (const runtime of runtimes.values()) {
      await add(db, runtime);
      existingAgentIds.delete(runtime.id);
    }

    for (const agentId of existingAgentIds) {
      await remove(agentId);
    }

    memoryRecoveryGeneration += 1;
    const recoveryGeneration = memoryRecoveryGeneration;
    void recoverOperationalMemory(runtimes, recoveryGeneration);

    return list();
  }

  async function recoverOperationalMemory(
    runtimes: Map<string, InternalAgentRuntime>,
    recoveryGeneration: number,
  ) {
    const pendingAgentIds = new Set(
      [...runtimes.values()]
        .filter((runtime) => runtime.agent.stabilizeMemory !== undefined)
        .map((runtime) => runtime.id),
    );

    forgeDebug({
      scope: 'internal-agent-registry',
      level: 'info',
      message: 'Operational memory background recovery started',
      context: { recoveryGeneration, agentCount: pendingAgentIds.size },
    });

    while (
      recoveryGeneration === memoryRecoveryGeneration &&
      pendingAgentIds.size > 0
    ) {
      for (const agentId of [...pendingAgentIds]) {
        if (recoveryGeneration !== memoryRecoveryGeneration) {
          return;
        }

        const runtime = agents.get(agentId)?.runtime;
        const stabilizeMemory = runtime?.agent.stabilizeMemory;
        if (!runtime || !stabilizeMemory) {
          pendingAgentIds.delete(agentId);
          continue;
        }

        const startedAt = Date.now();
        try {
          const result = await stabilizeMemory.call(runtime.agent);
          forgeDebug({
            scope: 'internal-agent-registry',
            level: 'info',
            message: 'Operational memory background recovery pass completed',
            agentId,
            context: {
              recoveryGeneration,
              durationMs: Date.now() - startedAt,
              overflowTokenCount: result.overflowTokenCount,
              needsMoreOverflowWork: result.needsMoreOverflowWork,
            },
          });

          if (!result.needsMoreOverflowWork) {
            pendingAgentIds.delete(agentId);
          }
        } catch (error) {
          forgeDebug({
            scope: 'internal-agent-registry',
            level: 'error',
            message: 'Operational memory background recovery pass failed',
            agentId,
            context: {
              recoveryGeneration,
              durationMs: Date.now() - startedAt,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }

        await delay(FIVE_SECONDS_MS);
      }
    }

    forgeDebug({
      scope: 'internal-agent-registry',
      level: 'info',
      message: 'Operational memory background recovery completed',
      context: { recoveryGeneration },
    });
  }

  async function add(db: Database, runtime: InternalAgentRuntime) {
    const existingAgent = agents.get(runtime.id);
    const pendingWakeEvents: AgentWakeEvent[] = existingAgent
      ? [
          ...((existingAgent.runner?.getSnapshot()?.wake.events ?? []) as AgentWakeEvent[]),
          ...((existingAgent.runner?.getSnapshot()?.pendingRunEvents ?? []) as AgentWakeEvent[]),
        ]
      : [];
    if (existingAgent) {
      existingAgent.runner?.stop();
      await existingAgent.runtime.dispose();
    }

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
          throw new InternalAgentRegistryReloadConfigError();
        }
        const reloadEmailMailboxes = createPerAgentEmailManager(db);
        const reloadCoolify = createPerAgentCoolifyManager(db);
        const reloadGitHubApps = createGitHubAppManager({
          db,
          httpServer: loaderConfig.httpServer,
          integrations: loaderConfig.integrations,
          publicBaseUrl: loaderConfig.publicBaseUrl,
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
    void runner.start().catch((error: unknown) => {
      forgeDebug({
        scope: 'internal-agent-registry',
        level: 'error',
        message: 'Agent runner failed to start',
        agentId: runtime.id,
        context: { error: error instanceof Error ? error.message : String(error) },
      });
    });
  }

  async function remove(agentId: string) {
    const entry = agents.get(agentId);
    if (!entry) return;
    entry.runner?.stop();
    agents.delete(agentId);
    await entry.runtime.dispose();
  }

  async function disposeAll() {
    memoryRecoveryGeneration += 1;
    await Promise.all(Array.from(agents.keys(), (agentId) => remove(agentId)));
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
    disposeAll,
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
