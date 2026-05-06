import { forgeDebug } from '@forge-runtime/core';
import type { Database } from '../database/index';
import type { AgentLoaderConfig } from './agent-loader';
import { createAgentRunner, type InternalAgentRunner } from './agent-runner';
import type { InternalAgentRuntime } from './runtime/types';
import { createSystemIntegrationStore } from '../system-integrations/store';
import { createAgentEmailManager, type AgentEmailManager } from '../email/migadu-manager';
import { createCoolifyManager, type CoolifyManager } from '../coolify/manager';

type InternalAgentEntry = {
  runtime: InternalAgentRuntime;
  runner: InternalAgentRunner;
};

/**
 * Creates a per-agent AgentEmailManager instance.
 * Call this for each agent to get an isolated email manager.
 */
export function createPerAgentEmailManager(db: Database): AgentEmailManager {
  const integrations = createSystemIntegrationStore(db);
  return createAgentEmailManager({ db, integrations });
}

/**
 * Creates a per-agent CoolifyManager instance.
 * Call this for each agent to get an isolated Coolify manager.
 */
export function createPerAgentCoolifyManager(db: Database): CoolifyManager {
  const integrations = createSystemIntegrationStore(db);
  return createCoolifyManager({ integrations });
}

function createInternalAgentRegistry() {
  const agents = new Map<string, InternalAgentEntry>();
  let loaderConfig: AgentLoaderConfig | null = null;

  async function loadAll(db: Database, config: AgentLoaderConfig) {
    loaderConfig = config;
    const existingAgentIds = new Set(agents.keys());

    // Each agent gets its own email and coolify manager at load time.
    const perAgentEmailMailboxes = createPerAgentEmailManager(db);
    const perAgentCoolify = createPerAgentCoolifyManager(db);

    const perAgentConfig: AgentLoaderConfig = {
      ...config,
      emailMailboxes: perAgentEmailMailboxes,
      coolify: perAgentCoolify,
    };

    const runtimes = await loadAgents(db, perAgentConfig);

    for (const runtime of runtimes.values()) {
      await add(db, runtime);
      existingAgentIds.delete(runtime.id);
    }

    for (const agentId of existingAgentIds) {
      remove(agentId);
    }

    return list();
  }

  async function add(db: Database, runtime: InternalAgentRuntime) {
    const existingAgent = agents.get(runtime.id);
    const pendingWakeEvents = existingAgent
      ? [
          ...existingAgent.runner.getSnapshot().wake.events,
          ...existingAgent.runner.getSnapshot().pendingRunEvents,
        ]
      : [];

    const entry = {
      runtime,
      runner: null as InternalAgentRunner | null,
    };

    const runner = createAgentRunner(db, runtime, {
      workspaceBasePath: loaderConfig?.workspaceBasePath,
      reloadRuntime: async () => {
        if (!loaderConfig) {
          throw new Error('Agent loader config is not available for runtime reload');
        }
        const reloadEmailMailboxes = createPerAgentEmailManager(db);
        const reloadCoolify = createPerAgentCoolifyManager(db);
        return loadAgent(db, {
          ...loaderConfig,
          emailMailboxes: reloadEmailMailboxes,
          coolify: reloadCoolify,
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
        forgeDebug({ scope: 'agent-registry', level: 'error', message: 'Failed to dispose replacement runtime', context: { runtimeId: runtime.id, error: disposeError } });
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
      forgeDebug({ scope: 'agent-registry', level: 'error', message: 'Failed to dispose runtime during remove', context: { agentId, error } });
    });

    agents.delete(agentId);
  }

  function getSnapshot() {
    return {
      agents: [...agents.values()].map((entry) => ({
        id: entry.runtime.id,
        name: entry.runtime.meta.name,
        executionState: entry.runner.getSnapshot().executionState,
      })),
    };
  }

  function list() {
    return [...agents.values()].map((entry) => entry.runtime);
  }

  function size() {
    return agents.size;
  }

  function get(agentId: string) {
    return agents.get(agentId)?.runtime ?? null;
  }

  return {
    loadAll,
    add,
    remove,
    getSnapshot,
    list,
    size,
    get,
  };
}

export const getInternalAgentRegistry = (() => {
  let registry: ReturnType<typeof createInternalAgentRegistry> | null = null;

  return () => {
    if (!registry) {
      registry = createInternalAgentRegistry();
    }
    return registry;
  };
})();