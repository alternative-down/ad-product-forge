/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import {
  ConversationRuntimeBridge,
  createRuntimeHost,
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
import { forgeAgentRuntimeConfigSchema, type ForgeAgentRuntimeConfig, type ForgeMcpServerConfig } from './contracts.js';
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
  memory: Omit<ForgeConversationMemoryOptions, 'threadId' | 'conversationStore' | 'assistantAuthorId'>;
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
  const mcpActions = mcpToolset
    ? await mcpToolset.createRuntimeActions()
    : [];
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
    actions: [
      ...(options.runtimeActions ?? []),
      ...mcpActions,
    ],
    plugins: [
      ...conversationMemory.plugins,
      ...(options.runtimePlugins ?? []),
    ],
    observers,
    eventStream: true,
    messageStream: true,
  });
  const bridge = new ConversationRuntimeBridge({
    runtime: host.runtime as RuntimeInputTarget,
    store: options.conversationStore,
  });

  return {
    host,
    bridge,
    memory: conversationMemory.memory,
    mcpToolset,
    async dispose() {
      await mcpToolset?.dispose();
    },
  };
}
