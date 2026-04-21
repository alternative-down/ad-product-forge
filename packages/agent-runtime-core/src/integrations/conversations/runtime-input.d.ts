import { z } from 'zod';
import type { ConversationMessagePart } from './contracts.js';
export declare const conversationRuntimeInputPayloadSchema: z.ZodObject<{
    threadId: z.ZodString;
    messageId: z.ZodString;
    role: z.ZodEnum<{
        user: "user";
        assistant: "assistant";
        system: "system";
        tool: "tool";
        external: "external";
    }>;
    authorId: z.ZodOptional<z.ZodString>;
    parts: z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
        type: z.ZodLiteral<"text">;
        text: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"image">;
        mimeType: z.ZodString;
        bytes: z.ZodCustom<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"file">;
        mimeType: z.ZodString;
        name: z.ZodString;
        bytes: z.ZodCustom<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
    }, z.core.$strip>]>>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export type ConversationRuntimeInputPayload = z.infer<typeof conversationRuntimeInputPayloadSchema>;
export declare function createConversationRuntimeInputPayload(input: {
    threadId: string;
    messageId: string;
    role: 'user' | 'assistant' | 'system' | 'tool' | 'external';
    authorId?: string;
    parts: ConversationMessagePart[];
    metadata?: Record<string, unknown>;
}): ConversationRuntimeInputPayload;
export declare function isConversationRuntimeInputPayload(payload: unknown): payload is ConversationRuntimeInputPayload;
