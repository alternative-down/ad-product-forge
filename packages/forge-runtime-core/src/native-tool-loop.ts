/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { generateText, stepCountIs, tool as createAiSdkTool, type LanguageModel } from 'ai';

import type { Tool } from './tools.js';

export type NativeToolLoopMessage =
  | {
      role: 'assistant' | 'system' | 'user';
      content: string;
    }
  | {
      role: 'assistant';
      content: Array<
        | {
            type: 'text';
            text: string;
          }
        | {
            type: 'tool-call';
            toolCallId: string;
            toolName: string;
            input: unknown;
          }
      >;
    }
  | {
      role: 'tool';
      content: Array<{
        type: 'tool-result';
        toolCallId: string;
        toolName: string;
        output: unknown;
      }>;
    };

export type NativeToolLoopDeferredCall = {
  toolName: string;
  input: unknown;
};

export type NativeToolLoopResult = {
  messages: NativeToolLoopMessage[];
  deferredToolCall: NativeToolLoopDeferredCall | null;
  text: string;
  finishReason: string | undefined;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
};

export async function runNativeToolLoop(input: {
  model: unknown;
  system?: string;
  prompt: string;
  tools: Record<string, Tool>;
  deferredToolNames?: string[];
  maxRounds?: number;
  maxStepsPerRound?: number;
  runtimeId: string;
}): Promise<NativeToolLoopResult> {
  const messages: NativeToolLoopMessage[] = [
    {
      role: 'user',
      content: input.prompt,
    },
  ];
  const deferredToolNames = new Set(input.deferredToolNames ?? []);
  const aiSdkTools = Object.fromEntries(
    Object.values(input.tools).map((tool) => {
      if (deferredToolNames.has(tool.id)) {
        return [
          tool.id,
          createAiSdkTool({
            description: tool.description,
            inputSchema: tool.inputSchema as never,
          }),
        ];
      }

      return [
        tool.id,
        createAiSdkTool({
          description: tool.description,
          inputSchema: tool.inputSchema as never,
          // eslint-disable-next-line @typescript-eslint/require-await
          execute: async (toolInput: unknown, options: { toolCallId: string }) =>
            tool.execute(toolInput, {
              runtimeId: input.runtimeId,
              stepId: options.toolCallId,
              stepNumber: 0,
              toolCallId: options.toolCallId,
            }),
        }),
      ];
    }),
  );
  let deferredToolCall: NativeToolLoopDeferredCall | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let lastText = '';
  let lastFinishReason: string | undefined;

  for (let round = 0; round < (input.maxRounds ?? 100); round += 1) {
    const result = await generateText({
      model: input.model as LanguageModel,
      system: input.system,
      messages: messages as never,
      tools: aiSdkTools,
      stopWhen: stepCountIs(input.maxStepsPerRound ?? 20),
    });

    lastText = result.text;
    lastFinishReason = result.finishReason;
    inputTokens += result.totalUsage.inputTokens ?? 0;
    outputTokens += result.totalUsage.outputTokens ?? 0;
    messages.push(...(result.response.messages as NativeToolLoopMessage[]));

    deferredToolCall = findDeferredToolCall(
      result.response.messages as NativeToolLoopMessage[],
      deferredToolNames,
    );

    if (deferredToolCall) {
      break;
    }

    if (result.toolCalls.length === 0) {
      break;
    }
  }

  return {
    messages,
    deferredToolCall,
    text: lastText,
    finishReason: lastFinishReason,
    usage: {
      inputTokens,
      outputTokens,
    },
  };
}

function findDeferredToolCall(
  messages: NativeToolLoopMessage[],
  deferredToolNames: Set<string>,
): NativeToolLoopDeferredCall | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (!message || message.role !== 'assistant' || !Array.isArray(message.content)) {
      continue;
    }

    const toolCall = message.content.find(
      (part) => part.type === 'tool-call' && deferredToolNames.has(part.toolName),
    );

    if (!toolCall || toolCall.type !== 'tool-call') {
      continue;
    }

    return {
      toolName: toolCall.toolName,
      input: toolCall.input,
    };
  }

  return null;
}
