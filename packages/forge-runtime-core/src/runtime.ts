import {
  ConversationRuntimeBridge,
  createRuntimeHost,
  createTextStepContextEntry,
  isConversationRuntimeInputPayload,
  type ConversationStore,
  type McpRuntimeActionOptions,
  type RuntimeObserver,
  type RuntimeActionDefinition,
  type RuntimeHost,
  type RuntimeInputTarget,
  type RuntimePlugin,
  type StepModelAdapter,
} from 'agent-runtime-core/integrations';

import { forgeAgentRuntimeConfigSchema, type ForgeAgentRuntimeConfig, type ForgeMcpServerConfig } from './contracts.js';
import { createForgeConversationMemory, type ForgeConversationMemoryOptions } from './memory.js';
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
      contextFormatter: {
        formatInput(runtimeInput) {
          if (isConversationRuntimeInputPayload(runtimeInput.payload)) {
            const text = runtimeInput.payload.parts
              .filter((part) => part.type === 'text')
              .map((part) => part.text.trim())
              .filter(Boolean)
              .join('\n')
              .trim();
            const content = runtimeInput.payload.parts
              .filter((part) => part.type === 'image')
              .map((part) => ({
                type: 'image' as const,
                mimeType: part.mimeType,
                bytes: part.bytes,
              }));

            return {
              id: `conversation-message:${runtimeInput.payload.messageId}`,
              kind: `input:conversation-message:${runtimeInput.payload.role}`,
              title: runtimeInput.payload.authorId
                ? `${runtimeInput.payload.role} message from ${runtimeInput.payload.authorId}`
                : `${runtimeInput.payload.role} message`,
              text: text || undefined,
              content: content.length > 0 ? content : undefined,
            };
          }

          return createTextStepContextEntry({
            id: runtimeInput.id,
            kind: `input:${runtimeInput.type}`,
            title: `Input ${runtimeInput.type}`,
            text: JSON.stringify(runtimeInput.payload, null, 2),
          });
        },
        formatActionResults(previousStepNumber, actionResults) {
          return createTextStepContextEntry({
            id: `action-results:${previousStepNumber}`,
            kind: 'action-results',
            title: 'Previous action results',
            text: JSON.stringify(actionResults, null, 2),
            data: actionResults,
          });
        },
      },
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
