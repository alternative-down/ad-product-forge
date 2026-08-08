import {
  ConversationRuntimeBridge,
  createRuntimeHost,
  type AgentRuntime,
  type ConversationStore,
  type McpRuntimeActionOptions,
  type RuntimeObserver,
  type RuntimeActionDefinition,
  type RuntimeHost,
  type RuntimeInputTarget,
  type RuntimePlugin,
  type StepModelAdapter,
} from 'agent-runtime-core/integrations';

import { createConversationRuntimeContextFormatter } from './conversation-runtime-context-formatter.js';
import {
  forgeAgentRuntimeConfigSchema,
  type ForgeAgentRuntimeConfig,
  type ForgeMcpServerConfig,
} from './contracts.js';
import {
  createForgeConversationMemory,
  type ForgeConversationMemory,
  type ForgeConversationMemoryOptions,
} from './memory.js';
import { ForgeMcpToolset } from './mcp.js';
import { createForgeUsageObserver, type ForgeUsageSink } from './usage.js';

export type CreateForgeAgentRuntimeOptions = {
  config: ForgeAgentRuntimeConfig;
  model: StepModelAdapter;
  conversationStore: ConversationStore;
  memory: Omit<
    ForgeConversationMemoryOptions,
    'threadId' | 'conversationStore' | 'assistantAuthorId'
  >;
  mcpServers?: ForgeMcpServerConfig[];
  runtimeActions?: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>;
  mcpRuntimeActionOptions?: Omit<McpRuntimeActionOptions, 'session'>;
  usageSink?: ForgeUsageSink;
  runtimeObservers?: RuntimeObserver[];
  runtimePlugins?: RuntimePlugin[];
};

export type ForgeAgentRuntime = {
  host: RuntimeHost;
  bridge: ConversationRuntimeBridge;
  memory: ForgeConversationMemory['memory'];
  mcpToolset: ForgeMcpToolset | null;
  dispose(): Promise<void>;
};

/**
 * Adapter that exposes only the dispatch surface required by
 * `RuntimeInputTarget`, isolating the structural narrowing from the
 * consumer (Finding 1 of #6307). The cast lives in one documented
 * location instead of being inline at the call site. AgentRuntime's
 * dispatch signature is structurally compatible with RuntimeInputTarget,
 * but TypeScript cannot prove the variance through a generic forwarding
 * function, so a single, justified cast is captured here.
 */
function toRuntimeInputTarget(runtime: AgentRuntime): RuntimeInputTarget {
  return {
    dispatch: (payload) => runtime.dispatch(payload) as Promise<void>,
  };
}

export async function createForgeAgentRuntime(
  options: CreateForgeAgentRuntimeOptions,
): Promise<ForgeAgentRuntime> {
  const config = forgeAgentRuntimeConfigSchema.parse(options.config);
  const conversationMemory = createForgeConversationMemory({
    ...options.memory,
    threadId: config.threadId,
    conversationStore: options.conversationStore,
    assistantAuthorId: config.assistantAuthorId,
    consolidateOverflow: config.consolidateConversationOverflow,
  });
  const mcpToolset = options.mcpServers?.length
    ? new ForgeMcpToolset({
        servers: options.mcpServers,
        runtimeActionOptions: options.mcpRuntimeActionOptions,
      })
    : null;
  const mcpActions = mcpToolset ? await mcpToolset.createRuntimeActions() : [];
  const observers = [...conversationMemory.observers];

  if (options.usageSink) {
    observers.push(createForgeUsageObserver(options.usageSink));
  }

  if (options.runtimeObservers?.length) {
    observers.push(...options.runtimeObservers);
  }

  const host = createRuntimeHost({
    runtime: {
      runtimeId: config.runtimeId ?? config.agentId,
      model: options.model,
      contextFormatter: createConversationRuntimeContextFormatter(),
    },
    actions: [...(options.runtimeActions ?? []), ...mcpActions],
    plugins: [...conversationMemory.plugins, ...(options.runtimePlugins ?? [])],
    observers,
    eventStream: true,
    messageStream: true,
  });
  const bridge = new ConversationRuntimeBridge({
    runtime: toRuntimeInputTarget(host.runtime),
    store: options.conversationStore,
  });

  return {
    host,
    bridge,
    memory: conversationMemory.memory,
    mcpToolset,
    async dispose() {
      // Finding 2 of #6307 (partial): only `mcpToolset` currently exposes
      // a dispose contract. `host`, `bridge`, and `conversationMemory`
      // hold no observable resources today (subsystem interfaces in
      // `agent-runtime-core` do not yet declare a dispose method), so
      // disposing them would require an interface-expansion follow-up
      // (tracked separately).
      await mcpToolset?.dispose();
    },
  };
}
