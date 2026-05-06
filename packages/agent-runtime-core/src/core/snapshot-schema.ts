import { z } from 'zod';

const runtimeInputSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  payload: z.unknown(),
  receivedAt: z.string().min(1),
});

const stepContextTextPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

const stepContextImagePartSchema = z.object({
  type: z.literal('image'),
  mimeType: z.string().min(1),
  bytes: z.instanceof(Uint8Array),
});

const stepContextPartSchema = z.union([
  stepContextTextPartSchema,
  stepContextImagePartSchema,
]);

const stepContextEntrySchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  title: z.string().min(1),
  content: z.array(stepContextPartSchema).optional(),
  text: z.string().optional(),
});

const stepContentSegmentSchema = z.object({
  kind: z.enum(['message', 'reasoning', 'note']),
  text: z.string(),
});

const actionRequestSchema = z.object({
  name: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
});

const actionResultSchema = z.object({
  name: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  output: z.unknown(),
});

const stepContinuationSchema = z.enum(['stop', 'continue', 'wait']);

const stepModelUsageSchema = z.object({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
  cachedInputTokens: z.number().optional(),
  reasoningTokens: z.number().optional(),
});

const stepModelMetadataSchema = z.object({
  provider: z.string().optional(),
  modelId: z.string().optional(),
});

const stepModelResponseSchema = z.object({
  segments: z.array(stepContentSegmentSchema),
  actionRequests: z.array(actionRequestSchema),
  continuation: stepContinuationSchema,
  usage: stepModelUsageSchema.optional(),
  metadata: stepModelMetadataSchema.optional(),
});

const stepRecordSchema = z.object({
  id: z.string().min(1),
  stepNumber: z.number().int().positive(),
  inputs: z.array(runtimeInputSchema),
  context: z.array(stepContextEntrySchema),
  modelResponse: stepModelResponseSchema,
  modelUsage: stepModelUsageSchema.nullable(),
  modelMetadata: stepModelMetadataSchema.nullable(),
  actionResults: z.array(actionResultSchema),
  continuation: stepContinuationSchema,
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1),
});

export const runtimeSnapshotSchema = z.object({
  runtimeId: z.string().min(1),
  status: z.enum(['idle', 'running']),
  pendingInputs: z.array(runtimeInputSchema),
  lastActionResults: z.array(actionResultSchema),
  steps: z.array(stepRecordSchema),
});
