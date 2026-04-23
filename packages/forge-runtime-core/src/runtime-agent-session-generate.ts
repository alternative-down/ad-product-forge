import { randomUUID } from 'node:crypto';

import {
  generateText,
  stepCountIs,
  tool as createAiSdkTool,
  type ModelMessage,
  type ToolSet,
} from 'ai';

import type { RuntimeActionDefinition } from 'agent-runtime-core/integrations';

import { loadCheckpointedOmSystemTexts } from './checkpointed-om-context-plugin.js';
import { createRuntimeAgentSessionIteration, resolveRuntimeAgentSessionContinuation } from './runtime-agent-session-iteration.js';
import {
  appendRuntimeSessionFeedback,
  appendRuntimeSessionModelMessages,
  appendRuntimeSessionPromptMessages,
  ensureRuntimeSessionThread,
  type RuntimeSessionModelMessage,
} from './runtime-agent-session-messages.js';
import type {
  CreateRuntimeAgentSessionOptions,
  RuntimeAgentSessionGenerateOptions,
  RuntimeAgentSessionGenerateMessage,
  RuntimeAgentSessionStepResult,
} from './runtime-agent-session.js';
import type { RuntimeAgentSessionRuntime } from './runtime-agent-session-runtime.js';
import { loadWorkingMemoryContextText } from './runtime-working-memory.js';

export async function runRuntimeAgentSessionGenerate(input: {
  runtime: RuntimeAgentSessionRuntime;
  session: CreateRuntimeAgentSessionOptions;
  prompt: RuntimeAgentSessionGenerateMessage;
  options: RuntimeAgentSessionGenerateOptions;
}): Promise<{
  text: string;
  usage?: RuntimeAgentSessionStepResult['usage'];
}> {
  const promptMessages = typeof input.prompt === 'string'
    ? [{
      role: 'user' as const,
      content: input.prompt,
    }]
    : input.prompt;

  await ensureRuntimeSessionThread({
    store: input.runtime.conversationStore,
    threadId: input.session.threadId,
    agentId: input.session.agentId,
  });
  await appendRuntimeSessionPromptMessages({
    store: input.runtime.conversationStore,
    threadId: input.session.threadId,
    agentId: input.session.agentId,
    messages: promptMessages,
  });
  await input.runtime.syncState();

  let finalText = '';
  let finalUsage: RuntimeAgentSessionStepResult['usage'];
  const maxSteps = input.options.maxSteps ?? 10_000;

  for (let iterationNumber = 1; iterationNumber <= maxSteps; iterationNumber += 1) {
    if (input.options.abortSignal?.aborted) {
      break;
    }

    await input.options.prepareStep?.({
      stepNumber: iterationNumber - 1,
    });

    const system = await buildRuntimeSessionSystemPrompt({
      baseSystem: input.session.system,
      stepSystem: iterationNumber === 1 ? input.options.system : undefined,
      threadId: input.session.threadId,
      resourceId: input.session.resourceId,
      workingMemoryStore: input.runtime.workingMemoryStore,
      checkpointedOmStateStore: input.runtime.checkpointedOmStateStore,
    });
    const messages = await buildRuntimeSessionModelMessages({
      store: input.runtime.conversationStore,
      conversationMemory: input.runtime.conversationMemory,
      threadId: input.session.threadId,
    });
    const stepId = randomUUID();
    const result = await generateText({
      model: input.runtime.model,
      system,
      messages,
      tools: buildAiSdkToolSet({
        runtimeId: input.session.agentId,
        stepId,
        stepNumber: iterationNumber,
        actions: input.runtime.runtimeActions,
      }),
      providerOptions: input.options.providerOptions as Record<string, never> | undefined,
      stopWhen: stepCountIs(1),
      abortSignal: input.options.abortSignal,
    });

    await appendRuntimeSessionModelMessages({
      store: input.runtime.conversationStore,
      threadId: input.session.threadId,
      assistantAuthorId: input.runtime.assistantAuthorId,
      messages: result.response.messages as RuntimeSessionModelMessage[],
    });
    await input.runtime.syncState();

    finalText = result.text;
    finalUsage = {
      inputTokens: result.totalUsage.inputTokens,
      outputTokens: result.totalUsage.outputTokens,
      totalTokens: result.totalUsage.totalTokens,
      cachedInputTokens: result.totalUsage.cachedInputTokens,
      reasoningTokens: result.totalUsage.reasoningTokens,
    };

    await input.options.onStepFinish?.({
      usage: finalUsage,
    });

    const runtimeIteration = createRuntimeAgentSessionIteration({
      iterationNumber,
      responseMessages: result.response.messages as RuntimeSessionModelMessage[],
      text: result.text,
      finishReason: result.finishReason,
      runId: input.options.runId ?? input.session.threadId,
      threadId: input.session.threadId,
      resourceId: input.session.resourceId,
      agentId: input.session.agentId,
      agentName: input.session.agentName,
    });
    const continuation = await resolveRuntimeAgentSessionContinuation({
      options: input.options,
      iteration: runtimeIteration,
    });

    if (continuation.feedback?.trim()) {
      await appendRuntimeSessionFeedback({
        store: input.runtime.conversationStore,
        threadId: input.session.threadId,
        text: continuation.feedback.trim(),
      });
      await input.runtime.syncState();
    }

    if (!continuation.continue) {
      break;
    }
  }

  return {
    text: finalText,
    usage: finalUsage,
  };
}

async function buildRuntimeSessionSystemPrompt(input: {
  baseSystem?: string;
  stepSystem?: string;
  threadId: string;
  resourceId: string;
  workingMemoryStore: RuntimeAgentSessionRuntime['workingMemoryStore'];
  checkpointedOmStateStore?: RuntimeAgentSessionRuntime['checkpointedOmStateStore'];
}) {
  const workingMemoryText = await loadWorkingMemoryContextText({
    threadId: input.threadId,
    resourceId: input.resourceId,
    store: input.workingMemoryStore,
  });
  const checkpointedOmTexts = input.checkpointedOmStateStore
    ? await loadCheckpointedOmSystemTexts({
      threadId: input.threadId,
      resourceId: input.resourceId,
      stateStore: input.checkpointedOmStateStore,
    })
    : [];

  return [
    input.baseSystem?.trim(),
    workingMemoryText?.trim(),
    ...checkpointedOmTexts,
    input.stepSystem?.trim(),
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n\n')
    .trim() || undefined;
}

async function buildRuntimeSessionModelMessages(input: {
  store: RuntimeAgentSessionRuntime['conversationStore'];
  conversationMemory: RuntimeAgentSessionRuntime['conversationMemory'];
  threadId: string;
}): Promise<ModelMessage[]> {
  const state = await input.conversationMemory.getState();
  const messages = await input.store.listMessages({
    threadId: input.threadId,
    afterMessageId: state.checkpointMessageId ?? undefined,
  });

  const modelMessages: ModelMessage[] = [];
  const pendingToolCallIds: string[] = [];

  for (const message of messages) {
    const nextMessages = toModelMessages(message, pendingToolCallIds);

    if (nextMessages.length === 0) {
      continue;
    }

    modelMessages.push(...nextMessages);
  }

  return modelMessages;
}

function toModelMessages(message: {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'external';
  parts: Array<{
    type: string;
    text?: string;
    mimeType?: string;
    bytes?: Uint8Array;
  }>;
  metadata?: Record<string, unknown>;
}, pendingToolCallIds: string[]): ModelMessage[] {
  const textContent = message.parts
    .filter((part): part is { type: string; text: string } => part.type === 'text' && typeof part.text === 'string')
    .map((part) => ({
      type: 'text' as const,
      text: part.text,
    }));
  const imageContent = message.parts
    .filter((part): part is { type: string; mimeType: string; bytes: Uint8Array } =>
      part.type === 'image' && typeof part.mimeType === 'string' && part.bytes instanceof Uint8Array)
    .map((part) => ({
      type: 'image' as const,
      image: toDataUrl(part.mimeType, part.bytes),
    }));

  if (message.role === 'assistant') {
    const toolInvocations = Array.isArray(message.metadata?.toolInvocations)
      ? message.metadata.toolInvocations
      : [];
    const assistantContent = [
      ...textContent,
      ...imageContent,
      ...toolInvocations
        .filter((value): value is { toolCallId?: unknown; toolName?: unknown; args?: unknown } =>
          typeof value === 'object' && value !== null)
        .map((toolInvocation, index) => {
          const toolCallId = typeof toolInvocation.toolCallId === 'string'
            ? toolInvocation.toolCallId
            : `${message.id}:tool:${index}`;

          pendingToolCallIds.push(toolCallId);

          return {
            type: 'tool-call' as const,
            toolCallId,
            toolName: typeof toolInvocation.toolName === 'string' ? toolInvocation.toolName : 'unknown',
            input: isRecord(toolInvocation.args) ? toolInvocation.args : {},
          };
        }),
    ];

    if (assistantContent.length === 0) {
      return [];
    }

    return [{
      role: 'assistant',
      content: assistantContent,
    } as ModelMessage];
  }

  if (message.role === 'tool') {
    const toolResults = Array.isArray(message.metadata?.toolResults)
      ? message.metadata.toolResults
      : [];

    if (toolResults.length === 0) {
      return [];
    }

    return [{
      role: 'tool',
      content: toolResults
        .filter((value): value is { toolCallId?: unknown; toolName?: unknown; result?: unknown } =>
          typeof value === 'object' && value !== null)
        .map((toolResult, index) => ({
          type: 'tool-result' as const,
          toolCallId:
            typeof toolResult.toolCallId === 'string'
              ? toolResult.toolCallId
              : pendingToolCallIds.shift() ?? `${message.id}:tool:${index}`,
          toolName: typeof toolResult.toolName === 'string' ? toolResult.toolName : 'unknown',
          output: {
            type: 'json' as const,
            value: toolResult.result,
          },
        })),
    } as ModelMessage];
  }

  const content = [...textContent, ...imageContent];

  if (content.length === 0) {
    return [];
  }

  if (message.role === 'system') {
    return [{
      role: 'system',
      content: textContent.map((part) => part.text).join('\n').trim(),
    } as ModelMessage].filter((value) => value.content);
  }

  return [{
    role: 'user',
    content,
  } as ModelMessage];
}

function buildAiSdkToolSet(input: {
  runtimeId: string;
  stepId: string;
  stepNumber: number;
  actions: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>;
}): ToolSet {
  const toolSet: ToolSet = {};

  for (const action of input.actions) {
    toolSet[action.name] = createAiSdkTool({
      description: action.description,
      inputSchema: action.inputSchema,
      execute: async (toolInput, _options) => {
        const parsedInput = action.parseInput
          ? action.parseInput(toolInput)
          : action.inputSchema.parse(toolInput);

        return action.execute(parsedInput, {
          runtimeId: input.runtimeId,
          stepId: input.stepId,
          stepNumber: input.stepNumber,
        });
      },
    });
  }

  return toolSet;
}

function toDataUrl(mimeType: string, bytes: Uint8Array) {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
