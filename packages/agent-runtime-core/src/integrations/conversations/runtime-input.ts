import { z } from 'zod';

import type { ConversationMessagePart } from './contracts.js';

export const conversationRuntimeInputPayloadSchema = z.object({
  threadId: z.string().min(1),
  messageId: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system', 'tool', 'external']),
  authorId: z.string().min(1).optional(),
  parts: z.array(
    z.union([
      z.object({
        type: z.literal('text'),
        text: z.string(),
      }),
      z.object({
        type: z.literal('reasoning'),
        text: z.string(),
        providerMetadata: z
          .object({
            anthropic: z
              .object({
                signature: z.string().optional(),
                redactedData: z.string().optional(),
              })
              .optional(),
          })
          .optional(),
      }),
      z.object({
        type: z.literal('image'),
        mimeType: z.string().min(1),
        bytes: z.instanceof(Uint8Array),
      }),
      z.object({
        type: z.literal('file'),
        mimeType: z.string().min(1),
        name: z.string().min(1),
        bytes: z.instanceof(Uint8Array),
      }),
    ]),
  ),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ConversationRuntimeInputPayload = z.infer<typeof conversationRuntimeInputPayloadSchema>;

export function createConversationRuntimeInputPayload(input: {
  threadId: string;
  messageId: string;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'external';
  authorId?: string;
  parts: ConversationMessagePart[];
  metadata?: Record<string, unknown>;
}): ConversationRuntimeInputPayload {
  return conversationRuntimeInputPayloadSchema.parse(input);
}

export function isConversationRuntimeInputPayload(
  payload: unknown,
): payload is ConversationRuntimeInputPayload {
  return conversationRuntimeInputPayloadSchema.safeParse(payload).success;
}
