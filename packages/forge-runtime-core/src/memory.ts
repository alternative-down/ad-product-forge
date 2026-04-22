import {
  CheckpointedConversationMemory,
  createCheckpointedConversationPlugin,
  type CheckpointedConversationObserver,
  type CheckpointedConversationStateStore,
  type ConversationStore,
  type RuntimeObserver,
  type RuntimePlugin,
} from 'agent-runtime-core/integrations';

export type ForgeConversationMemoryOptions = {
  threadId: string;
  conversationStore: ConversationStore;
  stateStore: CheckpointedConversationStateStore;
  assistantAuthorId?: string;
  observer?: CheckpointedConversationObserver;
  recentMessageLimit?: number;
  consolidateOverflow?: boolean;
};

export function createForgeConversationMemory(input: ForgeConversationMemoryOptions): {
  memory: CheckpointedConversationMemory;
  plugins: RuntimePlugin[];
  observers: RuntimeObserver[];
} {
  const memory = new CheckpointedConversationMemory({
    threadId: input.threadId,
    store: input.conversationStore,
    stateStore: input.stateStore,
    observer: input.observer,
    recentMessageLimit: input.recentMessageLimit,
  });

  return {
    memory,
    plugins: [
      createAssistantConversationPersistencePlugin({
        store: input.conversationStore,
        authorId: input.assistantAuthorId,
        threadId: input.threadId,
      }),
      createCheckpointedConversationPlugin({
        memory,
        consolidateAfterStep: input.consolidateOverflow,
        selectThreadId() {
          return input.threadId;
        },
      }),
    ],
    observers: [] as RuntimeObserver[],
  };
}

function createAssistantConversationPersistencePlugin(input: {
  store: ConversationStore;
  authorId?: string;
  threadId: string;
}): RuntimePlugin {
  return {
    name: 'forge-assistant-conversation-persistence',
    async onAfterStep(context) {
      const messageText = context.record.modelResponse.segments
        .filter((segment) => segment.kind === 'message')
        .map((segment) => segment.text.trim())
        .filter((text) => text.length > 0)
        .join('\n')
        .trim();
      const toolInvocations = context.record.modelResponse.actionRequests.map((actionRequest) => ({
        toolName: actionRequest.name,
        args: actionRequest.input,
      }));
      const toolResults = context.record.actionResults.map((actionResult) => ({
        toolName: actionResult.name,
        result: actionResult.output,
      }));

      if (!messageText && toolInvocations.length === 0 && toolResults.length === 0) {
        return;
      }

      await input.store.appendMessage({
        id: `${context.record.id}:assistant`,
        threadId: input.threadId,
        role: 'assistant',
        authorId: input.authorId,
        parts: messageText
          ? [{
            type: 'text',
            text: messageText,
          }]
          : [],
        metadata: {
          runtimeId: context.snapshot.runtimeId,
          stepId: context.record.id,
          stepNumber: context.record.stepNumber,
          toolInvocations,
          toolResults,
        },
        createdAt: context.record.finishedAt,
      });
    },
  };
}
