import { forgeDebug } from '@forge-runtime/core';
import type { Database } from '../database/index';
import { loadAgents, type AgentLoaderConfig } from './agent-loader';
import { createAgentRunner, type InternalAgentRunner } from './agent-runner';
import type { InternalAgentRuntime } from './runtime/types';
import { loadAgent } from './agent-loader';

type InternalAgentEntry = {
  runtime: InternalAgentRuntime;
  runner: InternalAgentRunner;
};

function createInternalAgentRegistry() {
  const agents = new Map<string, InternalAgentEntry>();
  let loaderConfig: AgentLoaderConfig | null = null;

  async function loadAll(db: Database, config: AgentLoaderConfig) {
    loaderConfig = config;
    const existingAgentIds = new Set(agents.keys());
    const runtimes = await loadAgents(db, config);

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

        return loadAgent(db, {
          ...loaderConfig,
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
      forgeDebug({ scope: 'agent-registry', level: 'error', message: 'Failed to dispose runtime', context: { agentId, error } });
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

const internalAgentRegistry = createInternalAgentRegistry();

export function getInternalAgentRegistry() {
  return internalAgentRegistry;
}
