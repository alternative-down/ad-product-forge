import {
  AiSdkStepModelAdapter,
  RuntimeRunController,
  type RuntimePlugin,
} from 'agent-runtime-core/integrations';

import { createCheckpointedOmCompatibilityObserver } from './checkpointed-om-compatibility.js';
import { createForgeAgentRuntime } from './runtime.js';
import {
  createUpdateWorkingMemoryTool,
  createWorkingMemoryPlugin,
} from './runtime-working-memory.js';
import { createRuntimeSystemInstructionPlugin } from './runtime-agent-session-system-plugin.js';
import type { CreateRuntimeAgentSessionOptions } from './runtime-agent-session.js';
import { toolToRuntimeAction } from './tools.js';

const DEFAULT_CHECKPOINTED_OM_LIMITS = {
  totalContextTokens: 50_000,
  recentRawTokens: 10_000,
  rawObservationBatchTokens: 5_000,
  observationReflectionBatchTokens: 5_000,
};

export async function createRuntimeAgentSessionRuntime(
  input: CreateRuntimeAgentSessionOptions,
) {
  const workingMemoryTool = input.workingMemoryTool ?? createUpdateWorkingMemoryTool({
    threadId: input.threadId,
    resourceId: input.resourceId,
    store: input.workingMemoryStore,
  });
  const runtimePlugins: RuntimePlugin[] = [
    createWorkingMemoryPlugin({
      threadId: input.threadId,
      resourceId: input.resourceId,
      store: input.workingMemoryStore,
    }),
    createRuntimeSystemInstructionPlugin(),
  ];
  const runtime = await createForgeAgentRuntime({
    config: {
      agentId: input.agentId,
      assistantAuthorId: input.assistantAuthorId,
      threadId: input.threadId,
      maxConversationMessages: input.maxConversationMessages ?? 20,
      consolidateConversationOverflow: input.consolidateConversationOverflow ?? true,
    },
    model: new AiSdkStepModelAdapter({
      model: input.model,
      system: input.system,
    }),
    conversationStore: input.conversationStore,
    memory: {
      stateStore: input.checkpointedStateStore,
    },
    runtimePlugins,
    runtimeActions: [
      toolToRuntimeAction(workingMemoryTool),
      ...(input.runtimeActions ?? []),
    ],
    runtimeObservers: input.runtimeObservers,
  });

  if (input.checkpointedOmStateStore) {
    runtime.host.runtime.observe(createCheckpointedOmCompatibilityObserver({
      threadId: input.threadId,
      resourceId: input.resourceId,
      conversationStore: input.conversationStore,
      conversationMemory: runtime.memory,
      stateStore: input.checkpointedOmStateStore,
      limits: input.checkpointedOmLimits ?? DEFAULT_CHECKPOINTED_OM_LIMITS,
      onCheckpointAdvanced: input.onCheckpointAdvanced,
    }));
  }

  return {
    runtime,
    runController: new RuntimeRunController({
      runtime: runtime.host.runtime,
    }),
  };
}
