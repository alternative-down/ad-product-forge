import { z } from 'zod';
import { type ContextFormatter } from '../../core/context-formatters.js';
import type { StepContextPart } from '../../core/types.js';
export declare const multimodalRuntimeInputPayloadSchema: z.ZodObject<{
    parts: z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
        type: z.ZodLiteral<"text">;
        text: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"image">;
        mimeType: z.ZodString;
        bytes: z.ZodCustom<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
    }, z.core.$strip>]>>;
}, z.core.$strip>;
export type MultimodalRuntimeInputPayload = z.infer<typeof multimodalRuntimeInputPayloadSchema>;
export declare function createMultimodalRuntimeInputPayload(parts: StepContextPart[]): MultimodalRuntimeInputPayload;
export declare function isMultimodalRuntimeInputPayload(payload: unknown): payload is MultimodalRuntimeInputPayload;
export declare function createMultimodalContextFormatter(): ContextFormatter;
