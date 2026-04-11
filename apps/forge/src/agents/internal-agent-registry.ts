import type { Database } from '../database/index';
import { loadAgents, type AgentLoaderConfig } from './agent-loader';
import { createAgentRunner, type InternalAgentRunner } from './agent-runner';
import type { InternalAgentRuntime } from './agent-runtime-types';
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

    for (const agent of agents.values()) {
      agent.runner.stop();
      void agent.runtime.dispose().catch((error) => {
        console.error(`[AgentRegistry] Failed to dispose runtime ${agent.runtime.id}:`, error);
      });
    }

    agents.clear();

    const runtimes = await loadAgents(db, config);

    for (const runtime of runtimes.values()) {
      await add(db, runtime);
    }

    return list();
  }

  async function add(db: Database, runtime: InternalAgentRuntime) {
    const existingAgent = agents.get(runtime.id);

    if (existingAgent) {
      existingAgent.runner.stop();
      await existingAgent.runtime.dispose();
      agents.delete(runtime.id);
    }

    const entry = {
      runtime,
      runner: null as InternalAgentRunner | null,
    };
    const runner = createAgentRunner(db, runtime, {
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

    agents.set(runtime.id, entry as InternalAgentEntry);
    await runner.start();

    return entry as InternalAgentEntry;
  }

  function remove(agentId: string) {
    const agent = agents.get(agentId);

    if (!agent) {
      return;
    }

    agent.runner.stop();
    void agent.runtime.dispose().catch((error) => {
      console.error(`[AgentRegistry] Failed to dispose runtime ${agentId}:`, error);
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
