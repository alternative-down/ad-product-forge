import type { ModelMessage } from 'ai';

import {
  CheckpointedConversationMemory,
  createCheckpointedConversationPlugin,
  type CheckpointedConversationObserver,
  type CheckpointedConversationStateStore,
  type ConversationStore,
  type RuntimeObserver,
  type RuntimePlugin,
} from 'agent-runtime-core/integrations';

import { createAssistantConversationPersistencePlugin } from './assistant-conversation-persistence-plugin.js';
import type { CheckpointedOmStateStore } from './checkpointed-om.js';

const AUTONOMOUS_CONTEXT_USER_MESSAGE_TEXT =
  'You are an autonomous company agent. Think proactively, decide what to do next inside your role, and continue work without waiting for conversational prompting.';

export type ForgeConversationMemoryOptions = {
  threadId: string;
  conversationStore: ConversationStore;
  stateStore: CheckpointedConversationStateStore;
  assistantAuthorId?: string;
  observer?: CheckpointedConversationObserver;
  recentTokenLimit?: number;
  overflowObservationTokenLimit?: number;
  consolidateOverflow?: boolean;
};

export type ForgeConversationMemory = {
  memory: CheckpointedConversationMemory;
  renderModelMessages(input: {
    resourceId: string;
    checkpointedOmStateStore?: CheckpointedOmStateStore;
    stepSystem?: string;
  }): Promise<ModelMessage[]>;
  plugins: RuntimePlugin[];
  observers: RuntimeObserver[];
};

export function createForgeConversationMemory(input: ForgeConversationMemoryOptions): ForgeConversationMemory {
  const memory = new CheckpointedConversationMemory({
    threadId: input.threadId,
    store: input.conversationStore,
    stateStore: input.stateStore,
    observer: input.observer,
    recentTokenLimit: input.recentTokenLimit,
    overflowObservationTokenLimit: input.overflowObservationTokenLimit,
  });

  return {
    memory,
    async renderModelMessages(renderInput) {
      const activeMessages = await memory.renderActiveMessages();

      return [
        ...buildStepSystemMessages(renderInput.stepSystem),
        ...await loadOmModelMessages({
          threadId: input.threadId,
          resourceId: renderInput.resourceId,
          stateStore: renderInput.checkpointedOmStateStore,
        }),
        {
          role: 'user',
          content: [{
            type: 'text' as const,
            text: AUTONOMOUS_CONTEXT_USER_MESSAGE_TEXT,
          }],
        } as ModelMessage,
        ...createRawModelMessages(activeMessages),
      ];
    },
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

function buildStepSystemMessages(stepSystem: string | undefined): ModelMessage[] {
  const content = stepSystem?.trim();

  if (!content) {
    return [];
  }

  return [{
    role: 'system',
    content,
  } satisfies ModelMessage];
}

async function loadOmModelMessages(input: {
  threadId: string;
  resourceId: string;
  stateStore?: CheckpointedOmStateStore;
}): Promise<ModelMessage[]> {
  if (!input.stateStore) {
    return [];
  }

  const state = await input.stateStore.loadState({
    threadId: input.threadId,
    resourceId: input.resourceId,
  });

  if (!state) {
    return [];
  }

  const messages: ModelMessage[] = [];
  const checkpointText = normalizeOmText(state.checkpointSummary?.text);

  if (checkpointText) {
    messages.push({
      role: 'system',
      content: ['Checkpoint summary:', checkpointText].join('\n'),
    });
  }

  for (const reflection of state.activeReflectionBlocks) {
    const text = normalizeOmText(reflection.text);

    if (!text) {
      continue;
    }

    messages.push({
      role: 'system',
      content: ['Active reflection:', text].join('\n'),
    });
  }

  for (const observation of state.observationBlocks) {
    if (observation.reflectedGeneration !== null) {
      continue;
    }

    const text = normalizeOmText(observation.text);

    if (!text) {
      continue;
    }

    messages.push({
      role: 'system',
      content: ['Active observation:', text].join('\n'),
    });
  }

  return messages;
}

function normalizeOmText(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function createRawModelMessages(messages: Array<{
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'external';
  parts: Array<{
    type: string;
    text?: string;
    mimeType?: string;
    bytes?: Uint8Array;
    providerMetadata?: {
      anthropic?: {
        signature?: string;
        redactedData?: string;
      };
    };
  }>;
  metadata?: Record<string, unknown>;
}>): ModelMessage[] {
  const orderedEntries: Array<
    | ModelMessage
    | {
        kind: 'assistant';
        textContent: Array<
          | { type: 'text'; text: string }
          | {
              type: 'reasoning';
              text: string;
              providerOptions?: {
                anthropic?: {
                  signature?: string;
                  redactedData?: string;
                };
              };
            }
        >;
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
      .filter((part): part is {
        type: string;
        text: string;
        providerMetadata?: {
          anthropic?: {
            signature?: string;
            redactedData?: string;
          };
        };
      } =>
        (part.type === 'text' || part.type === 'reasoning') && typeof part.text === 'string')
      .map((part) => ({
        type: part.type === 'reasoning' ? 'reasoning' as const : 'text' as const,
        text: part.text,
        ...(part.type === 'reasoning' && part.providerMetadata?.anthropic
          ? {
              providerOptions: {
                anthropic: {
                  ...(typeof part.providerMetadata.anthropic.signature === 'string'
                    ? { signature: part.providerMetadata.anthropic.signature }
                    : {}),
                  ...(typeof part.providerMetadata.anthropic.redactedData === 'string'
                    ? { redactedData: part.providerMetadata.anthropic.redactedData }
                    : {}),
                },
              },
            }
          : {}),
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

          if (!availableToolCallIds.has(toolResult.toolCallId)) {
            return [];
          }

          fulfilledToolCallIds.add(toolResult.toolCallId);

          return [{
            type: 'tool-result' as const,
            toolCallId: toolResult.toolCallId,
            toolName: typeof toolResult.toolName === 'string' ? toolResult.toolName : 'unknown',
            output: {
              type: 'json' as const,
              value: toolResult.result,
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

  const modelMessages: ModelMessage[] = [];

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

      modelMessages.push({
        role: 'assistant',
        content,
      } as ModelMessage);
      continue;
    }

    modelMessages.push(entry as ModelMessage);
  }

  return modelMessages;
}

function toDataUrl(mimeType: string, bytes: Uint8Array) {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
