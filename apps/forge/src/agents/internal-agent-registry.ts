import type { Database } from '../database/index.js';
import { loadAgents, type AgentLoaderConfig } from './agent-loader.js';
import { createAgentRunner, type InternalAgentRunner } from './agent-runner.js';
import type { InternalAgentRuntime } from './create-forge-agent.js';

type InternalAgentEntry = {
  runtime: InternalAgentRuntime;
  runner: InternalAgentRunner;
};

function createInternalAgentRegistry() {
  const agents = new Map<string, InternalAgentEntry>();

  async function loadAll(db: Database, config: AgentLoaderConfig) {
    for (const agent of agents.values()) {
      agent.runner.stop();
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
      agents.delete(runtime.id);
    }

    const runner = createAgentRunner(db, runtime);
    const entry = {
      runtime,
      runner,
    };

    agents.set(runtime.id, entry);
    await runner.start();

    return entry;
  }

  function remove(agentId: string) {
    const agent = agents.get(agentId);

    if (!agent) {
      return;
    }

    agent.runner.stop();
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
