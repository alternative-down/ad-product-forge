import { generateText, streamText, tool, type LanguageModel } from 'ai';
import { z } from 'zod';

import { AsyncEventChannel } from '../../core/async-event-channel.js';
import type { StepModelAdapter, StreamingStepModelAdapter } from '../../core/model.js';
import { getStepContextParts, getStepContextText } from '../../core/step-context.js';
import type {
  ActionRequest,
  StepActionDescriptor,
  StepContentSegment,
  StepContextEntry,
  StepModelRequest,
  StepModelResponse,
  StepModelStream,
  StepModelStreamEvent,
} from '../../core/types.js';

const emptyObjectSchema = z.object({});

export type AiSdkModelAdapterOptions = {
  model: LanguageModel;
  system?: string;
  temperature?: number;
  provider?: string;
  modelId?: string;
};

export class AiSdkStepModelAdapter implements StepModelAdapter, StreamingStepModelAdapter {
  private readonly model: LanguageModel;
  private readonly system: string | undefined;
  private readonly temperature: number | undefined;
  private readonly provider: string | undefined;
  private readonly modelId: string | undefined;

  constructor(options: AiSdkModelAdapterOptions) {
    this.model = options.model;
    this.system = options.system;
    this.temperature = options.temperature;
    this.provider = options.provider;
    this.modelId = options.modelId;
  }

  async generateStep(request: StepModelRequest): Promise<StepModelResponse> {
    const result = await generateText({
      model: this.model,
      temperature: this.temperature,
      system: this.system,
      messages: buildAiSdkMessages(request.context, request.actions),
      tools: buildToolSet(request.actions),
    });

    return buildStepModelResponse({
      content: result.content,
      toolCalls: result.toolCalls,
      usage: result.usage,
      provider: this.provider,
      modelId: this.modelId,
    });
  }

  async streamStep(request: StepModelRequest): Promise<StepModelStream> {
    const result = streamText({
      model: this.model,
      temperature: this.temperature,
      system: this.system,
      messages: buildAiSdkMessages(request.context, request.actions),
      tools: buildToolSet(request.actions),
    });
    const events = new AsyncEventChannel<StepModelStreamEvent>();

    void forwardAiSdkStreamEvents({
      fullStream: result.fullStream,
      events,
    });

    return {
      events,
      response: (async () => {
        const [content, toolCalls, usage] = await Promise.all([
          result.content,
          result.toolCalls,
          result.usage,
        ]);

        return buildStepModelResponse({
          content,
          toolCalls,
          usage,
          provider: this.provider,
          modelId: this.modelId,
        });
      })(),
    };
  }
}

export function renderAiSdkPrompt(
  context: StepContextEntry[],
  actions: StepActionDescriptor[],
) {
  return [
    'You are executing one bounded agent step.',
    'Use the provided context entries as the full visible context for this step.',
    'Some context entries may also include image parts that are attached separately to the same request.',
    'Respond with normal text and call tools when needed.',
    'If another step should follow immediately without external action, call runtime_continue.',
    'If the runtime should wait for new input, call runtime_wait.',
    'If no tool is needed and no continuation tool is needed, answer and stop.',
    '',
    '<available-actions>',
    renderActionSection(actions),
    '</available-actions>',
    '',
    '<context>',
    renderContextSection(context),
    '</context>',
  ].join('\n');
}

function buildAiSdkMessages(
  context: StepContextEntry[],
  actions: StepActionDescriptor[],
) {
  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; image: string }
  > = [{
    type: 'text',
    text: renderAiSdkPrompt(context, actions),
  }];

  for (const entry of context) {
    for (const part of getStepContextParts(entry)) {
      if (part.type !== 'image') {
        continue;
      }

      content.push({
        type: 'image',
        image: toDataUrl(part.mimeType, part.bytes),
      });
    }
  }

  return [{
    role: 'user' as const,
    content,
  }];
}

function renderActionSection(actions: StepActionDescriptor[]) {
  if (actions.length === 0) {
    return 'No actions are available.';
  }

  return actions.map((action) => [
    `<action name="${action.name}">`,
    action.description,
    action.inputSchemaText,
    '</action>',
  ].join('\n')).join('\n\n');
}

function renderContextSection(context: StepContextEntry[]) {
  if (context.length === 0) {
    return 'No context entries were provided.';
  }

  return context.map((entry) => [
    `<entry id="${entry.id}" kind="${entry.kind}" image-parts="${countImageParts(entry)}">`,
    `<title>${entry.title}</title>`,
    getStepContextText(entry) || '[No text content]',
    '</entry>',
  ].join('\n')).join('\n\n');
}

function buildToolSet(actions: StepActionDescriptor[]) {
  const toolSet = {
    runtime_continue: tool({
      description: 'Request one more immediate runtime step without waiting for new external input.',
      inputSchema: emptyObjectSchema,
    }),
    runtime_wait: tool({
      description: 'Tell the runtime to wait for new external input.',
      inputSchema: emptyObjectSchema,
    }),
  };

  for (const action of actions) {
    (toolSet as Record<string, unknown>)[action.name] = tool({
      description: action.description,
      inputSchema: action.inputSchema,
    });
  }

  return toolSet;
}

function buildStepModelResponse(input: {
  content: Array<{ type: string; text?: string }>;
  toolCalls: Array<{ toolName: string; input: unknown }>;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cachedInputTokens?: number;
    reasoningTokens?: number;
  };
  provider?: string;
  modelId?: string;
}): StepModelResponse {
  const actionRequests = mapToolCallsToActionRequests(input.toolCalls);

  return {
    segments: mapContentToSegments(input.content),
    actionRequests,
    continuation: resolveContinuation({
      toolCalls: input.toolCalls,
      actionRequests,
    }),
    usage: {
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      totalTokens: input.usage.totalTokens,
      cachedInputTokens: input.usage.cachedInputTokens,
      reasoningTokens: input.usage.reasoningTokens,
    },
    metadata: {
      provider: input.provider,
      modelId: input.modelId,
    },
  };
}

async function forwardAiSdkStreamEvents(input: {
  fullStream: AsyncIterable<{
    type: string;
    text?: string;
    toolName?: string;
    input?: unknown;
  }>;
  events: AsyncEventChannel<StepModelStreamEvent>;
}) {
  try {
    for await (const part of input.fullStream) {
      if (part.type === 'text-delta' && part.text?.length) {
        input.events.publish({
          type: 'segment-delta',
          segment: {
            kind: 'message',
            text: part.text,
          },
        });
        continue;
      }

      if (part.type === 'reasoning-delta' && part.text?.length) {
        input.events.publish({
          type: 'segment-delta',
          segment: {
            kind: 'reasoning',
            text: part.text,
          },
        });
        continue;
      }

      if (part.type === 'tool-call' && part.toolName && !isRuntimeControlTool(part.toolName)) {
        input.events.publish({
          type: 'action-request',
          actionRequest: {
            name: part.toolName,
            input: isRecord(part.input) ? part.input : {},
          },
        });
      }
    }
  } finally {
    input.events.close();
  }
}

function mapContentToSegments(content: Array<{ type: string; text?: string }>) {
  const segments: StepContentSegment[] = [];

  for (const part of content) {
    if (part.type === 'text' && part.text?.trim()) {
      segments.push({
        kind: 'message',
        text: part.text.trim(),
      });
      continue;
    }

    if (part.type === 'reasoning' && part.text?.trim()) {
      segments.push({
        kind: 'reasoning',
        text: part.text.trim(),
      });
    }
  }

  return segments;
}

function mapToolCallsToActionRequests(
  toolCalls: Array<{ toolName: string; input: unknown }>,
) {
  return toolCalls
    .filter((toolCall) => !isRuntimeControlTool(toolCall.toolName))
    .map((toolCall): ActionRequest => ({
      name: toolCall.toolName,
      input: isRecord(toolCall.input) ? toolCall.input : {},
    }));
}

function resolveContinuation(input: {
  toolCalls: Array<{ toolName: string }>;
  actionRequests: ActionRequest[];
}): StepModelResponse['continuation'] {
  if (input.toolCalls.some((toolCall) => toolCall.toolName === 'runtime_wait')) {
    return 'wait';
  }

  if (
    input.toolCalls.some((toolCall) => toolCall.toolName === 'runtime_continue')
    || input.actionRequests.length > 0
  ) {
    return 'continue';
  }

  return 'stop';
}

function isRuntimeControlTool(name: string) {
  return name === 'runtime_continue' || name === 'runtime_wait';
}

function countImageParts(entry: StepContextEntry) {
  return getStepContextParts(entry).filter((part) => part.type === 'image').length;
}

function toDataUrl(mimeType: string, bytes: Uint8Array) {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
