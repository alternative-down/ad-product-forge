import {
  ConversationRuntimeBridge,
  createRuntimeHost,
  type ConversationStore,
  type McpRuntimeActionOptions,
  type RuntimeObserver,
  type RuntimeActionDefinition,
  type RuntimeHost,
  type RuntimeInputTarget,
  type StepModelAdapter,
  type WorkspaceGateway,
} from 'agent-runtime-core/integrations';

import { createForgeInternalAgentAction, createForgeWorkspaceActions, type ForgeInternalAgentInvoker } from './actions.js';
import { forgeAgentRuntimeConfigSchema, type ForgeAgentRuntimeConfig, type ForgeMcpServerConfig } from './contracts.js';
import { createForgeConversationMemory, type ForgeConversationMemoryOptions } from './memory.js';
import { ForgeMcpToolset } from './mcp.js';
import { createForgeMcpToolsetFromStore, type ForgeMcpServerStore } from './mcp-store.js';
import { createForgeUsageObserver, type ForgeUsageSink } from './usage.js';

export type CreateForgeAgentRuntimeOptions = {
  config: ForgeAgentRuntimeConfig;
  model: StepModelAdapter;
  conversationStore: ConversationStore;
  memory: Omit<ForgeConversationMemoryOptions, 'threadId' | 'conversationStore' | 'assistantAuthorId'>;
  mcpServers?: ForgeMcpServerConfig[];
  mcpServerStore?: ForgeMcpServerStore;
  runtimeActions?: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>;
  mcpRuntimeActionOptions?: Omit<McpRuntimeActionOptions, 'session'>;
  workspaceGateway?: WorkspaceGateway;
  internalAgentInvoker?: ForgeInternalAgentInvoker;
  usageSink?: ForgeUsageSink;
  runtimeObservers?: RuntimeObserver[];
};

export type ForgeAgentRuntime = {
  host: RuntimeHost;
  bridge: ConversationRuntimeBridge;
  memory: ReturnType<typeof createForgeConversationMemory>['memory'];
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
    recentMessageLimit: config.maxConversationMessages,
    consolidateOverflow: config.consolidateConversationOverflow,
  });
  const mcpToolset = options.mcpServers?.length
    ? new ForgeMcpToolset({
      servers: options.mcpServers,
      runtimeActionOptions: options.mcpRuntimeActionOptions,
    })
    : await (
      options.mcpServerStore
        ? createForgeMcpToolsetFromStore({
          agentId: config.agentId,
          store: options.mcpServerStore,
          runtimeActionOptions: options.mcpRuntimeActionOptions,
        })
        : Promise.resolve(null)
    );
  const mcpActions = mcpToolset
    ? await mcpToolset.createRuntimeActions()
    : [];
  const workspaceActions = options.workspaceGateway
    ? createForgeWorkspaceActions(options.workspaceGateway)
    : [];
  const internalAgentActions = options.internalAgentInvoker
    ? [createForgeInternalAgentAction(options.internalAgentInvoker)]
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
    },
    actions: [
      ...(options.runtimeActions ?? []),
      ...workspaceActions,
      ...internalAgentActions,
      ...mcpActions,
    ],
    plugins: conversationMemory.plugins,
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
