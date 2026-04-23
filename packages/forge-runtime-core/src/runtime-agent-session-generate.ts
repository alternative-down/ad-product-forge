import { randomUUID } from 'node:crypto';

import {
  generateText,
  stepCountIs,
  tool as createAiSdkTool,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import { z } from 'zod';

import type { RuntimeActionDefinition } from 'agent-runtime-core/integrations';

import { loadCheckpointedOmSystemTexts } from './checkpointed-om-context-plugin.js';
import { createRuntimeAgentSessionIteration, resolveRuntimeAgentSessionContinuation } from './runtime-agent-session-iteration.js';
import {
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
import { truncateToolOutputValue } from './tool-output-truncation.js';
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
  let transientMessages: Array<{
    role: 'assistant' | 'user';
    content: string;
  }> = [];

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
      transientMessages,
    });
    const stepId = randomUUID();
    const tools = buildAiSdkToolSet({
      runtimeId: input.session.agentId,
      stepId,
      stepNumber: iterationNumber,
      actions: input.runtime.runtimeActions,
    });
    const requestDiagnostics = summarizeGenerateRequest({
      system: system.text,
      systemSegments: system.segments,
      messages,
      actions: input.runtime.runtimeActions,
    });
    let result;

    try {
      result = await generateText({
        model: input.runtime.model,
        system: system.text,
        messages,
        tools,
        providerOptions: input.options.providerOptions as Record<string, never> | undefined,
        stopWhen: stepCountIs(1),
        abortSignal: input.options.abortSignal,
      });
    } catch (error) {
      throw appendGenerateDiagnostics(error, requestDiagnostics);
    }

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

    transientMessages = continuation.feedback?.trim()
      ? [{
        role: 'user',
        content: continuation.feedback.trim(),
      }]
      : [];

    if (!continuation.continue) {
      break;
    }
  }

  return {
    text: finalText,
    usage: finalUsage,
  };
}

function summarizeGenerateRequest(input: {
  system?: string;
  systemSegments: {
    baseSystem: string;
    workingMemory: string;
    checkpointedOm: string[];
    stepSystem: string;
  };
  messages: ModelMessage[];
  actions: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>;
}) {
  const messageBreakdown = input.messages.reduce((total, message) => {
    const stats = summarizeModelMessage(message);

    total.textChars += stats.textChars;
    total.toolCallChars += stats.toolCallChars;
    total.toolResultChars += stats.toolResultChars;
    total.imageCount += stats.imageCount;
    total.roles[message.role] = (total.roles[message.role] ?? 0) + 1;
    return total;
  }, {
    textChars: 0,
    toolCallChars: 0,
    toolResultChars: 0,
    imageCount: 0,
    roles: {} as Record<string, number>,
  });

  return {
    systemChars: input.system?.length ?? 0,
    systemSegmentChars: {
      baseSystem: input.systemSegments.baseSystem.length,
      workingMemory: input.systemSegments.workingMemory.length,
      checkpointedOm: input.systemSegments.checkpointedOm.map((segment) => segment.length),
      stepSystem: input.systemSegments.stepSystem.length,
    },
    messageCount: input.messages.length,
    messageChars: messageBreakdown.textChars + messageBreakdown.toolCallChars + messageBreakdown.toolResultChars,
    messageTextChars: messageBreakdown.textChars,
    messageToolCallChars: messageBreakdown.toolCallChars,
    messageToolResultChars: messageBreakdown.toolResultChars,
    messageImageCount: messageBreakdown.imageCount,
    messageRoleCounts: messageBreakdown.roles,
    toolCount: input.actions.length,
    toolDescriptionChars: input.actions.reduce((total, action) => total + action.description.length, 0),
    toolSchemaChars: input.actions.reduce(
      (total, action) => total + JSON.stringify(z.toJSONSchema(action.inputSchema)).length,
      0,
    ),
  };
}

function summarizeModelMessage(message: ModelMessage) {
  if (typeof message.content === 'string') {
    return {
      textChars: message.content.length,
      toolCallChars: 0,
      toolResultChars: 0,
      imageCount: 0,
    };
  }

  if (!Array.isArray(message.content)) {
    return {
      textChars: 0,
      toolCallChars: 0,
      toolResultChars: 0,
      imageCount: 0,
    };
  }

  return message.content.reduce((total, part) => {
    if ('text' in part && typeof part.text === 'string') {
      total.textChars += part.text.length;
      return total;
    }

    if ('input' in part) {
      total.toolCallChars += JSON.stringify(part.input).length;
      return total;
    }

    if ('output' in part) {
      total.toolResultChars += JSON.stringify(part.output).length;
      return total;
    }

    if ('image' in part) {
      total.imageCount += 1;
    }

    return total;
  }, {
    textChars: 0,
    toolCallChars: 0,
    toolResultChars: 0,
    imageCount: 0,
  });
}

function appendGenerateDiagnostics(error: unknown, diagnostics: {
  systemChars: number;
  messageCount: number;
  messageChars: number;
  toolCount: number;
  toolDescriptionChars: number;
  toolSchemaChars: number;
}) {
  const diagnosticsText = `generateDiagnostics: ${JSON.stringify(diagnostics)}`;

  if (error instanceof Error) {
    error.message = `${error.message}\n${diagnosticsText}`;
    return error;
  }

  return new Error(`${String(error)}\n${diagnosticsText}`);
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
  const segments = {
    baseSystem: input.baseSystem?.trim() || '',
    workingMemory: workingMemoryText?.trim() || '',
    checkpointedOm: checkpointedOmTexts.filter(Boolean),
    stepSystem: input.stepSystem?.trim() || '',
  };

  return {
    text: [
      segments.baseSystem,
      segments.workingMemory,
      ...segments.checkpointedOm,
      segments.stepSystem,
    ]
      .filter((value): value is string => Boolean(value))
      .join('\n\n')
      .trim() || undefined,
    segments,
  };
}

async function buildRuntimeSessionModelMessages(input: {
  store: RuntimeAgentSessionRuntime['conversationStore'];
  conversationMemory: RuntimeAgentSessionRuntime['conversationMemory'];
  threadId: string;
  transientMessages: Array<{
    role: 'assistant' | 'user';
    content: string;
  }>;
}): Promise<ModelMessage[]> {
  const state = await input.conversationMemory.getState();
  const recentMessages = normalizeReplayMessages(
    await input.conversationMemory.renderRecentMessages(),
  );
  const activeMessages = normalizeReplayMessages(await input.store.listMessages({
    threadId: input.threadId,
    order: 'asc',
  }));
  const replayMessageMap = new Map(activeMessages.map((message) => [message.id, message]));

  for (const message of recentMessages) {
    replayMessageMap.set(message.id, message);
  }

  const replayMessages = expandRecentReplayMessages({
    activeMessages,
    recentMessageIds: state.recentMessageIds ?? [],
    activeMessageMap: replayMessageMap,
  });

  return [
    ...createReplayMessages(replayMessages),
    ...input.transientMessages.map((message) => ({
      role: message.role,
      content: [{
        type: 'text' as const,
        text: message.content,
      }],
    }) as ModelMessage),
  ];
}

function normalizeReplayMessages(messages: Array<{
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'external';
  parts: Array<{
    type: string;
    text?: string;
    mimeType?: string;
    bytes?: Uint8Array;
  }>;
  metadata?: Record<string, unknown>;
}>) {
  return messages.map((message, index) => {
    if (message.role !== 'assistant') {
      return message;
    }

    const toolInvocations = Array.isArray(message.metadata?.toolInvocations)
      ? message.metadata.toolInvocations
      : [];
    const missingIdIndexes = toolInvocations.flatMap((toolInvocation, toolInvocationIndex) =>
      typeof toolInvocation === 'object'
      && toolInvocation !== null
      && typeof toolInvocation.toolName === 'string'
      && typeof toolInvocation.toolCallId !== 'string'
        ? [toolInvocationIndex]
        : []);

    if (missingIdIndexes.length === 0) {
      return message;
    }

    const nextMessage = messages[index + 1];

    if (nextMessage?.role !== 'tool') {
      return message;
    }

    const toolResults = Array.isArray(nextMessage.metadata?.toolResults)
      ? nextMessage.metadata.toolResults
      : [];
    const explicitToolCallIds = toolResults.flatMap((toolResult) =>
      typeof toolResult === 'object'
      && toolResult !== null
      && typeof toolResult.toolCallId === 'string'
        ? [toolResult.toolCallId]
        : []);

    if (explicitToolCallIds.length === 0 || explicitToolCallIds.length !== missingIdIndexes.length) {
      return message;
    }

    const normalizedToolInvocations = [...toolInvocations];

    for (const [normalizedIndex, missingIndex] of missingIdIndexes.entries()) {
      const toolInvocation = normalizedToolInvocations[missingIndex];
      const toolCallId = explicitToolCallIds[normalizedIndex];

      if (
        typeof toolInvocation !== 'object'
        || toolInvocation === null
        || typeof toolInvocation.toolName !== 'string'
        || typeof toolCallId !== 'string'
      ) {
        return message;
      }

      normalizedToolInvocations[missingIndex] = {
        ...toolInvocation,
        toolCallId,
      };
    }

    return {
      ...message,
      metadata: {
        ...message.metadata,
        toolInvocations: normalizedToolInvocations,
      },
    };
  });
}

function expandRecentReplayMessages(input: {
  activeMessages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool' | 'external';
    metadata?: Record<string, unknown>;
  }>;
  recentMessageIds: string[];
  activeMessageMap: Map<string, {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool' | 'external';
    parts: Array<{
      type: string;
      text?: string;
      mimeType?: string;
      bytes?: Uint8Array;
    }>;
    metadata?: Record<string, unknown>;
  }>;
}) {
  return input.activeMessages
    .filter((message) => input.recentMessageIds.includes(message.id))
    .map((message) => input.activeMessageMap.get(message.id))
    .filter((message): message is NonNullable<typeof message> => Boolean(message));
}

function createReplayMessages(messages: Array<{
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'external';
  parts: Array<{
    type: string;
    text?: string;
    mimeType?: string;
    bytes?: Uint8Array;
  }>;
  metadata?: Record<string, unknown>;
}>): ModelMessage[] {
  const orderedEntries: Array<
    | ModelMessage
    | {
        kind: 'assistant';
        textContent: Array<{ type: 'text'; text: string }>;
        imageContent: Array<{ type: 'image'; image: string }>;
        toolCalls: Array<{
          type: 'tool-call';
          toolCallId: string;
          toolName: string;
          input: Record<string, unknown>;
        }>;
      }
  > = [];
  const availableToolCallIds = new Set<string>();
  const fulfilledToolCallIds = new Set<string>();

  for (const message of messages) {
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
      const toolCalls = toolInvocations
        .filter((value): value is { toolCallId?: unknown; toolName?: unknown; args?: unknown } =>
          typeof value === 'object' && value !== null)
        .flatMap((toolInvocation) => {
          if (typeof toolInvocation.toolCallId !== 'string') {
            return [];
          }

          availableToolCallIds.add(toolInvocation.toolCallId);

          return [{
            type: 'tool-call' as const,
            toolCallId: toolInvocation.toolCallId,
            toolName: typeof toolInvocation.toolName === 'string' ? toolInvocation.toolName : 'unknown',
            input: isRecord(toolInvocation.args) ? toolInvocation.args : {},
          }];
        });

      orderedEntries.push({
        kind: 'assistant',
        textContent,
        imageContent,
        toolCalls,
      });
      continue;
    }

    if (message.role === 'tool') {
      const toolResults = Array.isArray(message.metadata?.toolResults)
        ? message.metadata.toolResults
        : [];
      const content = toolResults
        .filter((value): value is { toolCallId?: unknown; toolName?: unknown; result?: unknown } =>
          typeof value === 'object' && value !== null)
        .flatMap((toolResult) => {
          if (typeof toolResult.toolCallId !== 'string') {
            return [];
          }

          const toolCallId = toolResult.toolCallId;

          if (!availableToolCallIds.has(toolCallId)) {
            return [];
          }

          fulfilledToolCallIds.add(toolCallId);

          return [{
            type: 'tool-result' as const,
            toolCallId,
            toolName: typeof toolResult.toolName === 'string' ? toolResult.toolName : 'unknown',
            output: {
              type: 'json' as const,
              value: truncateToolOutputValue(toolResult.result),
            },
          }];
        });

      if (content.length > 0) {
        orderedEntries.push({
          role: 'tool',
          content,
        } as ModelMessage);
      }

      continue;
    }

    const content = [...textContent, ...imageContent];

    if (content.length === 0) {
      continue;
    }

    if (message.role === 'system') {
      const systemText = textContent.map((part) => part.text).join('\n').trim();

      if (systemText) {
        orderedEntries.push({
          role: 'system',
          content: systemText,
        } as ModelMessage);
      }

      continue;
    }

    orderedEntries.push({
      role: 'user',
      content,
    } as ModelMessage);
  }

  const replayMessages: ModelMessage[] = [];

  for (const entry of orderedEntries) {
    if ('kind' in entry && entry.kind === 'assistant') {
      const toolCalls = entry.toolCalls.filter((toolCall) => fulfilledToolCallIds.has(toolCall.toolCallId));
      const content = [
        ...entry.textContent,
        ...entry.imageContent,
        ...toolCalls,
      ];

      if (content.length === 0) {
        continue;
      }

      replayMessages.push({
        role: 'assistant',
        content,
      } as ModelMessage);
      continue;
    }

    replayMessages.push(entry as ModelMessage);
  }

  return replayMessages;
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
        const output = await action.execute(parsedInput, {
          runtimeId: input.runtimeId,
          stepId: input.stepId,
          stepNumber: input.stepNumber,
        });

        return truncateToolOutputValue(output);
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
