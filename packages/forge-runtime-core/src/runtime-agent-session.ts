import { randomUUID } from 'node:crypto';

import type { LanguageModel } from 'ai';
import {
  AiSdkStepModelAdapter,
  RuntimeRunController,
  type ConversationStore,
  type RuntimeActionDefinition,
  type RuntimeObserver,
} from 'agent-runtime-core/integrations';

import {
  createCheckpointedOmCompatibilityObserver,
} from './checkpointed-om-compatibility.js';
import type { CheckpointedOmStateStore } from './checkpointed-om.js';
import {
  createForgeAgentRuntime,
  type CreateForgeAgentRuntimeOptions,
} from './runtime.js';
import {
  createUpdateWorkingMemoryTool,
  createWorkingMemoryPlugin,
  type RuntimeWorkingMemoryStore,
} from './runtime-working-memory.js';
import { toolToRuntimeAction, type Tool } from './tools.js';

export type RuntimeAgentSessionGenerateMessage =
  | string
  | Array<{
      role: 'assistant' | 'user';
      content: string;
    }>;

export type RuntimeAgentSessionStepResult = {
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cachedInputTokens?: number;
    reasoningTokens?: number;
  };
};

export type RuntimeAgentSessionIteration = {
  iteration: number;
  text: string;
  toolCalls: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  toolResults: Array<{
    id: string;
    name: string;
    result: unknown;
    error?: Error;
  }>;
  isFinal: boolean;
  finishReason: string;
  runId: string;
  threadId: string;
  resourceId: string;
  agentId: string;
  agentName: string;
  messages: unknown[];
};

export type RuntimeAgentSessionGenerateOptions = {
  runId?: string;
  maxSteps?: number;
  system?: string;
  abortSignal?: AbortSignal;
  prepareStep?: (input: { stepNumber: number }) => Promise<void> | void;
  savePerStep?: boolean;
  memory?: {
    thread: string;
    resource: string;
    options: {
      lastMessages: number;
    };
  };
  providerOptions?: Record<string, unknown>;
  onStepFinish?: (result: RuntimeAgentSessionStepResult) => Promise<void> | void;
  onIterationComplete?: (
    iteration: RuntimeAgentSessionIteration,
  ) => Promise<{ continue?: boolean; feedback?: string } | void> | { continue?: boolean; feedback?: string } | void;
};

export type RuntimeAgentSession = {
  generate(
    prompt: RuntimeAgentSessionGenerateMessage,
    options?: RuntimeAgentSessionGenerateOptions,
  ): Promise<{
    text: string;
    usage?: RuntimeAgentSessionStepResult['usage'];
  }>;
  hasOwnMemory(): boolean;
  getMemory(): Promise<{
    getWorkingMemory(input: {
      threadId: string;
      resourceId: string;
    }): Promise<string | null>;
    updateWorkingMemory(input: {
      threadId: string;
      resourceId: string;
      workingMemory: string;
    }): Promise<void>;
  }>;
  dispose(): Promise<void>;
};

export type CreateRuntimeAgentSessionOptions = {
  agentId: string;
  agentName: string;
  threadId: string;
  resourceId: string;
  assistantAuthorId?: string;
  model: LanguageModel;
  system?: string;
  conversationStore: ConversationStore;
  checkpointedStateStore: CreateForgeAgentRuntimeOptions['memory']['stateStore'];
  workingMemoryStore: RuntimeWorkingMemoryStore;
  checkpointedOmStateStore?: CheckpointedOmStateStore;
  checkpointedOmLimits?: {
    totalContextTokens: number;
    recentRawTokens: number;
    rawObservationBatchTokens: number;
    observationReflectionBatchTokens: number;
  };
  onCheckpointAdvanced?: (input: {
    threadId: string;
    resourceId: string;
    fromGeneration: number | null;
    toGeneration: number;
    checkpointSummary: {
      text: string;
      tokenCount: number;
      upToGeneration: number;
      updatedAt: string;
    };
    reflections: Array<{
      recordId: string;
      generationCount: number;
      tokenCount: number;
      createdAt: string;
      text: string;
    }>;
    observations: Array<{
      blockId: string;
      tokenCount: number;
      createdAt: string;
      lastObservedAt: string;
      reflectedGeneration: number;
      text: string;
    }>;
  }) => Promise<void>;
  runtimeActions?: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>;
  runtimeObservers?: RuntimeObserver[];
  workingMemoryTool?: Tool<{ workingMemory: string }, { updated: true }>;
  maxConversationMessages?: number;
  consolidateConversationOverflow?: boolean;
};

export async function createRuntimeAgentSession(
  input: CreateRuntimeAgentSessionOptions,
): Promise<RuntimeAgentSession> {
  const workingMemoryTool = input.workingMemoryTool ?? createUpdateWorkingMemoryTool({
    threadId: input.threadId,
    resourceId: input.resourceId,
    store: input.workingMemoryStore,
  });
  const runtimePlugins = [
    createWorkingMemoryPlugin({
      threadId: input.threadId,
      resourceId: input.resourceId,
      store: input.workingMemoryStore,
    }),
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
  const runController = new RuntimeRunController({
    runtime: runtime.host.runtime,
  });

  if (input.checkpointedOmStateStore) {
    runtime.host.runtime.observe(createCheckpointedOmCompatibilityObserver({
      threadId: input.threadId,
      resourceId: input.resourceId,
      conversationStore: input.conversationStore,
      conversationMemory: runtime.memory,
      stateStore: input.checkpointedOmStateStore,
      limits: input.checkpointedOmLimits ?? {
        totalContextTokens: 50_000,
        recentRawTokens: 10_000,
        rawObservationBatchTokens: 5_000,
        observationReflectionBatchTokens: 5_000,
      },
      onCheckpointAdvanced: input.onCheckpointAdvanced,
    }));
  }

  return {
    async generate(prompt, options = {}) {
      if (options.system?.trim()) {
        await runtime.bridge.dispatchMessage({
          thread: {
            id: input.threadId,
            participantIds: [input.agentId],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          message: {
            id: randomUUID(),
            threadId: input.threadId,
            role: 'user',
            parts: [{
              type: 'text',
              text: options.system.trim(),
            }],
            createdAt: new Date().toISOString(),
          },
        });
      }

      const promptMessages = typeof prompt === 'string'
        ? [{
          role: 'user' as const,
          content: prompt,
        }]
        : prompt;

      for (const message of promptMessages) {
        await runtime.bridge.dispatchMessage({
          thread: {
            id: input.threadId,
            participantIds: [input.agentId],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          message: {
            id: randomUUID(),
            threadId: input.threadId,
            role: message.role,
            authorId: message.role === 'assistant' ? input.agentId : undefined,
            parts: [{
              type: 'text',
              text: message.content,
            }],
            createdAt: new Date().toISOString(),
          },
        });
      }

      let finalText = '';
      let finalUsage: RuntimeAgentSessionStepResult['usage'];

      await runController.run({
        maxSteps: options.maxSteps,
        signal: options.abortSignal,
        beforeStep: async ({ nextStepNumber }) => {
          await options.prepareStep?.({
            stepNumber: nextStepNumber - 1,
          });
        },
        afterStep: async ({ latestStep }) => {
          finalText = latestStep.modelResponse.segments
            .filter((segment) => segment.kind === 'message')
            .map((segment) => segment.text)
            .join('');
          finalUsage = latestStep.modelUsage ?? undefined;
          await options.onStepFinish?.({
            usage: latestStep.modelUsage ?? undefined,
          });
        },
        continueAfterStep: async ({ latestStep }) => {
          const result = await options.onIterationComplete?.({
            iteration: latestStep.stepNumber,
            text: latestStep.modelResponse.segments
              .filter((segment) => segment.kind === 'message')
              .map((segment) => segment.text)
              .join(''),
            toolCalls: latestStep.modelResponse.actionRequests.map((actionRequest, index) => ({
              id: `${latestStep.id}:${index}`,
              name: actionRequest.name,
              args: actionRequest.input,
            })),
            toolResults: latestStep.actionResults.map((actionResult, index) => ({
              id: `${latestStep.id}:${index}`,
              name: actionResult.name,
              result: actionResult.output,
            })),
            isFinal: latestStep.continuation !== 'continue',
            finishReason: latestStep.continuation,
            runId: options.runId ?? input.threadId,
            threadId: input.threadId,
            resourceId: input.resourceId,
            agentId: input.agentId,
            agentName: input.agentName,
            messages: [],
          });

          if (result?.feedback?.trim()) {
            await runtime.bridge.dispatchMessage({
              thread: {
                id: input.threadId,
                participantIds: [input.agentId],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              message: {
                id: randomUUID(),
                threadId: input.threadId,
                role: 'user',
                parts: [{
                  type: 'text',
                  text: result.feedback.trim(),
                }],
                createdAt: new Date().toISOString(),
              },
            });
          }

          if (result?.continue !== undefined) {
            return result.continue;
          }

          return false;
        },
      });

      return {
        text: finalText,
        usage: finalUsage,
      };
    },
    hasOwnMemory() {
      return true;
    },
    async getMemory() {
      return {
        async getWorkingMemory(value) {
          return (
            await input.workingMemoryStore.read({
              threadId: value.threadId,
              resourceId: value.resourceId,
            })
          )?.workingMemory ?? null;
        },
        async updateWorkingMemory(value) {
          await input.workingMemoryStore.write(value);
        },
      };
    },
    async dispose() {
      await runtime.dispose();
    },
  };
}
