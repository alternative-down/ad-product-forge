import { z } from 'zod';
export declare const runtimeInputSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodString;
    payload: z.ZodUnknown;
    receivedAt: z.ZodString;
}, z.core.$strip>;
export declare const stepContextEntrySchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodString;
    title: z.ZodString;
    content: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
        type: z.ZodLiteral<"text">;
        text: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"image">;
        mimeType: z.ZodString;
        bytes: z.ZodCustom<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
    }, z.core.$strip>]>>>;
    text: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const stepContentSegmentSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        message: "message";
        reasoning: "reasoning";
        note: "note";
    }>;
    text: z.ZodString;
}, z.core.$strip>;
export declare const actionRequestSchema: z.ZodObject<{
    name: z.ZodString;
    input: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.core.$strip>;
export declare const actionResultSchema: z.ZodObject<{
    name: z.ZodString;
    input: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    output: z.ZodUnknown;
}, z.core.$strip>;
export declare const stepContinuationSchema: z.ZodEnum<{
    stop: "stop";
    continue: "continue";
    wait: "wait";
}>;
export declare const stepModelUsageSchema: z.ZodObject<{
    inputTokens: z.ZodOptional<z.ZodNumber>;
    outputTokens: z.ZodOptional<z.ZodNumber>;
    totalTokens: z.ZodOptional<z.ZodNumber>;
    cachedInputTokens: z.ZodOptional<z.ZodNumber>;
    reasoningTokens: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const stepModelMetadataSchema: z.ZodObject<{
    provider: z.ZodOptional<z.ZodString>;
    modelId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const stepModelResponseSchema: z.ZodObject<{
    segments: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<{
            message: "message";
            reasoning: "reasoning";
            note: "note";
        }>;
        text: z.ZodString;
    }, z.core.$strip>>;
    actionRequests: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        input: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.core.$strip>>;
    continuation: z.ZodEnum<{
        stop: "stop";
        continue: "continue";
        wait: "wait";
    }>;
    usage: z.ZodOptional<z.ZodObject<{
        inputTokens: z.ZodOptional<z.ZodNumber>;
        outputTokens: z.ZodOptional<z.ZodNumber>;
        totalTokens: z.ZodOptional<z.ZodNumber>;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        reasoningTokens: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    metadata: z.ZodOptional<z.ZodObject<{
        provider: z.ZodOptional<z.ZodString>;
        modelId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const stepRecordSchema: z.ZodObject<{
    id: z.ZodString;
    stepNumber: z.ZodNumber;
    inputs: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodString;
        payload: z.ZodUnknown;
        receivedAt: z.ZodString;
    }, z.core.$strip>>;
    context: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodString;
        title: z.ZodString;
        content: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
            type: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"image">;
            mimeType: z.ZodString;
            bytes: z.ZodCustom<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
        }, z.core.$strip>]>>>;
        text: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    modelResponse: z.ZodObject<{
        segments: z.ZodArray<z.ZodObject<{
            kind: z.ZodEnum<{
                message: "message";
                reasoning: "reasoning";
                note: "note";
            }>;
            text: z.ZodString;
        }, z.core.$strip>>;
        actionRequests: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            input: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, z.core.$strip>>;
        continuation: z.ZodEnum<{
            stop: "stop";
            continue: "continue";
            wait: "wait";
        }>;
        usage: z.ZodOptional<z.ZodObject<{
            inputTokens: z.ZodOptional<z.ZodNumber>;
            outputTokens: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cachedInputTokens: z.ZodOptional<z.ZodNumber>;
            reasoningTokens: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        metadata: z.ZodOptional<z.ZodObject<{
            provider: z.ZodOptional<z.ZodString>;
            modelId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    modelUsage: z.ZodNullable<z.ZodObject<{
        inputTokens: z.ZodOptional<z.ZodNumber>;
        outputTokens: z.ZodOptional<z.ZodNumber>;
        totalTokens: z.ZodOptional<z.ZodNumber>;
        cachedInputTokens: z.ZodOptional<z.ZodNumber>;
        reasoningTokens: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    modelMetadata: z.ZodNullable<z.ZodObject<{
        provider: z.ZodOptional<z.ZodString>;
        modelId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    actionResults: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        input: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        output: z.ZodUnknown;
    }, z.core.$strip>>;
    continuation: z.ZodEnum<{
        stop: "stop";
        continue: "continue";
        wait: "wait";
    }>;
    startedAt: z.ZodString;
    finishedAt: z.ZodString;
}, z.core.$strip>;
export declare const runtimeSnapshotSchema: z.ZodObject<{
    runtimeId: z.ZodString;
    status: z.ZodEnum<{
        idle: "idle";
        running: "running";
    }>;
    pendingInputs: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodString;
        payload: z.ZodUnknown;
        receivedAt: z.ZodString;
    }, z.core.$strip>>;
    lastActionResults: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        input: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        output: z.ZodUnknown;
    }, z.core.$strip>>;
    steps: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        stepNumber: z.ZodNumber;
        inputs: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodString;
            payload: z.ZodUnknown;
            receivedAt: z.ZodString;
        }, z.core.$strip>>;
        context: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodString;
            title: z.ZodString;
            content: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
                type: z.ZodLiteral<"text">;
                text: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                type: z.ZodLiteral<"image">;
                mimeType: z.ZodString;
                bytes: z.ZodCustom<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
            }, z.core.$strip>]>>>;
            text: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        modelResponse: z.ZodObject<{
            segments: z.ZodArray<z.ZodObject<{
                kind: z.ZodEnum<{
                    message: "message";
                    reasoning: "reasoning";
                    note: "note";
                }>;
                text: z.ZodString;
            }, z.core.$strip>>;
            actionRequests: z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                input: z.ZodRecord<z.ZodString, z.ZodUnknown>;
            }, z.core.$strip>>;
            continuation: z.ZodEnum<{
                stop: "stop";
                continue: "continue";
                wait: "wait";
            }>;
            usage: z.ZodOptional<z.ZodObject<{
                inputTokens: z.ZodOptional<z.ZodNumber>;
                outputTokens: z.ZodOptional<z.ZodNumber>;
                totalTokens: z.ZodOptional<z.ZodNumber>;
                cachedInputTokens: z.ZodOptional<z.ZodNumber>;
                reasoningTokens: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
            metadata: z.ZodOptional<z.ZodObject<{
                provider: z.ZodOptional<z.ZodString>;
                modelId: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        modelUsage: z.ZodNullable<z.ZodObject<{
            inputTokens: z.ZodOptional<z.ZodNumber>;
            outputTokens: z.ZodOptional<z.ZodNumber>;
            totalTokens: z.ZodOptional<z.ZodNumber>;
            cachedInputTokens: z.ZodOptional<z.ZodNumber>;
            reasoningTokens: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        modelMetadata: z.ZodNullable<z.ZodObject<{
            provider: z.ZodOptional<z.ZodString>;
            modelId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        actionResults: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            input: z.ZodRecord<z.ZodString, z.ZodUnknown>;
            output: z.ZodUnknown;
        }, z.core.$strip>>;
        continuation: z.ZodEnum<{
            stop: "stop";
            continue: "continue";
            wait: "wait";
        }>;
        startedAt: z.ZodString;
        finishedAt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
