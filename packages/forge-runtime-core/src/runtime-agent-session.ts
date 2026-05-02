import type { LanguageModel } from 'ai';
import type {
  ConversationStore,
  RuntimeActionDefinition,
  RuntimeObserver,
} from 'agent-runtime-core/integrations';

import type { CreateForgeAgentRuntimeOptions } from './runtime.js';
import { type RuntimeWorkingMemoryStore } from './runtime-working-memory.js';
import { runRuntimeAgentSessionGenerate } from './runtime-agent-session-generate.js';
import { createRuntimeAgentSessionRuntime } from './runtime-agent-session-runtime.js';
import { type Tool } from './tools.js';

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
  omTrace?: RuntimeAgentSessionOmTraceEvent[];
};

export type RuntimeAgentSessionOmTraceEvent = {
  at: number;
  scope: string;
  phase: string;
  metrics?: Record<string, number | string | null>;
  detail?: Record<string, unknown> | null;
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
  loadTodosText?: () => Promise<string | undefined>;
  onStepFinish?: (result: RuntimeAgentSessionStepResult) => Promise<void> | void;
  onIterationComplete?: (
    iteration: RuntimeAgentSessionIteration,
  ) => Promise<{
      continue?: boolean;
      feedback?: string;
      feedbackMessages?: Array<{
        role: 'assistant' | 'user';
        content: string;
      }>;
    } | void>
    | {
      continue?: boolean;
      feedback?: string;
      feedbackMessages?: Array<{
        role: 'assistant' | 'user';
        content: string;
      }>;
    }
    | void;
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
  checkpointedStateStore?: CreateForgeAgentRuntimeOptions['memory']['stateStore'];
  workingMemoryStore?: RuntimeWorkingMemoryStore;
  checkpointedOmLimits?: {
    totalContextTokens: number;
    recentRawTokens: number;
    rawObservationBatchTokens: number;
    observationReflectionBatchTokens: number;
    observationSupportTokens: number;
    reflectionSupportTokens: number;
  };
  checkpointedOmModel?: LanguageModel;
  checkpointedOmSystemPrompt?: string;
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
  loadRuntimeActions?: () => Promise<Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>>;
  runtimeObservers?: RuntimeObserver[];
  workingMemoryTool?: Tool<{ workingMemory: string }, { updated: true }>;
  todoStore?: { client: { execute(sql: string, args?: unknown[]): Promise<{ rows: unknown[] }> }; tablePrefix?: string };
  consolidateConversationOverflow?: boolean;
};

export async function createRuntimeAgentSession(
  input: CreateRuntimeAgentSessionOptions,
): Promise<RuntimeAgentSession> {
  const runtime = await createRuntimeAgentSessionRuntime(input);

  return {
    async generate(prompt, options = {}) {
      return runRuntimeAgentSessionGenerate({
        runtime,
        session: input,
        prompt,
        options,
      });
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
      await Promise.resolve();
    },
  };
}
