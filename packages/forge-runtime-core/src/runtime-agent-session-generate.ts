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
  RuntimeAgentSessionOmTraceEvent,
  RuntimeAgentSessionStepResult,
} from './runtime-agent-session.js';
import type { RuntimeAgentSessionRuntime } from './runtime-agent-session-runtime.js';
import { truncateToolOutputValue } from './tool-output-truncation.js';

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
  const runHistoryWindow = input.options.memory?.options.lastMessages && input.options.memory.options.lastMessages > 0
    ? await input.runtime.conversationMemory.captureRunHistoryWindow({
      lastMessages: input.options.memory.options.lastMessages,
    })
    : undefined;

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
    const omTrace: RuntimeAgentSessionOmTraceEvent[] = [];
    const omDiagnostics = {
      record(event: RuntimeAgentSessionOmTraceEvent) {
        omTrace.push(event);
      },
    };

    if (input.options.abortSignal?.aborted) {
      break;
    }

    await input.options.prepareStep?.({
      stepNumber: iterationNumber - 1,
    });

    const system = await buildRuntimeSessionSystemPrompt({
      baseSystem: input.session.system,
      agentContext: iterationNumber === 1 ? input.options.system : undefined,
      todosText: iterationNumber === 1 ? (input.options.loadTodosText ? await input.options.loadTodosText() : undefined) : undefined,
      planText: iterationNumber === 1 ? (input.options.loadPlanText ? await input.options.loadPlanText() : undefined) : undefined,
      threadId: input.session.threadId,
      resourceId: input.session.resourceId,
    });
    const messages = await input.runtime.conversationMemory.renderModelMessages({
      historyWindow: runHistoryWindow,
    });
    const runtimeActions = await input.runtime.getRuntimeActions();
    const stepId = randomUUID();
    const tools = buildAiSdkToolSet({
      runtimeId: input.session.agentId,
      stepId,
      stepNumber: iterationNumber,
      actions: runtimeActions,
    });
    const requestDiagnostics = summarizeGenerateRequest({
      system: system.text,
      systemSegments: system.segments,
      messages,
      actions: runtimeActions,
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
    await input.runtime.syncState({
      diagnostics: omDiagnostics,
    });

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
      omTrace,
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

    const continuationMessages = [
      ...((continuation.feedbackMessages ?? []).map((message) => ({
        role: message.role,
        content: message.content.trim(),
      })).filter((message) => message.content)),
      ...(continuation.feedback?.trim()
        ? [{
            role: 'user' as const,
            content: continuation.feedback.trim(),
          }]
        : []),
    ];

    if (continuation.continue && continuationMessages.length > 0) {
      await appendRuntimeSessionPromptMessages({
        store: input.runtime.conversationStore,
        threadId: input.session.threadId,
        agentId: input.session.agentId,
        messages: continuationMessages,
      });
      await input.runtime.syncState({
        diagnostics: omDiagnostics,
      });
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

function summarizeGenerateRequest(input: {
  system?: string;
  systemSegments: {
    baseSystem: string;
    workingMemory: string;
    agentContext: string;
    todosText: string;
    planText: string;
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
      agentContext: input.systemSegments.agentContext.length,
    },
    messageCount: input.messages.length,
    messageChars: messageBreakdown.textChars + messageBreakdown.toolCallChars + messageBreakdown.toolResultChars,
    messageTextChars: messageBreakdown.textChars,
    messageToolCallChars: messageBreakdown.toolCallChars,
    messageToolResultChars: messageBreakdown.toolResultChars,
    messageImageCount: messageBreakdown.imageCount,
    messageRoleCounts: messageBreakdown.roles,
    messageOutline: input.messages.slice(0, 12).map(summarizeReplayMessageOutline),
    toolCount: input.actions.length,
    toolDescriptionChars: input.actions.reduce((total, action) => total + action.description.length, 0),
    toolSchemaChars: input.actions.reduce(
      (total, action) => total + JSON.stringify(z.toJSONSchema(action.inputSchema)).length,
      0,
    ),
  };
}

function summarizeReplayMessageOutline(message: ModelMessage) {
  if (typeof message.content === 'string') {
    return {
      role: message.role,
      contentType: 'string',
      textChars: message.content.length,
    };
  }

  if (!Array.isArray(message.content)) {
    return {
      role: message.role,
      contentType: 'empty',
      textChars: 0,
    };
  }

  return {
    role: message.role,
    contentType: 'parts',
    partTypes: message.content.map((part) => part.type),
    textChars: message.content.reduce((total, part) => {
      if ('text' in part && typeof part.text === 'string') {
        return total + part.text.length;
      }

      if ('input' in part) {
        return total + JSON.stringify(part.input).length;
      }

      if ('output' in part) {
        return total + JSON.stringify(part.output).length;
      }

      return total;
    }, 0),
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
  agentContext?: string;
  todosText?: string;
  planText?: string;
  threadId: string;
  resourceId: string;
}) {
  const segments = {
    baseSystem: input.baseSystem?.trim() || '',
    workingMemory: '',
    agentContext: input.agentContext?.trim() || '',
    todosText: input.todosText?.trim() || '',
    planText: input.planText?.trim() || '',
  };

  return {
    text: [
      segments.baseSystem,
      segments.workingMemory,
      segments.agentContext,
    ]
      .filter((value): value is string => Boolean(value))
      .join('\n\n')
      .trim() || undefined,
    todosText: input.todosText?.trim() || '',
    segments,
  };
}

function buildAiSdkToolSet(input: {
  runtimeId: string;
  stepId: string;
  stepNumber: number;
  actions: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>;
}): ToolSet {
  const toolSet: ToolSet = {};
  const lastActionIndex = input.actions.length - 1;

  for (const [index, action] of input.actions.entries()) {
    toolSet[action.name] = createAiSdkTool({
      description: action.description,
      inputSchema: action.inputSchema,
      providerOptions: index === lastActionIndex
        ? {
            anthropic: {
              cacheControl: {
                type: 'ephemeral',
                ttl: '1h',
              },
            },
          }
        : undefined,
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
