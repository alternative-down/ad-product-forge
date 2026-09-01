import type { z } from 'zod';

export type StepModelJsonValue =
  | string
  | number
  | boolean
  | null
  | StepModelJsonValue[]
  | {
      [key: string]: StepModelJsonValue | undefined;
    };

export type RuntimeInput<TPayload = unknown> = {
  id: string;
  type: string;
  payload?: TPayload;
  receivedAt: string;
};

export type StepContextPart =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image';
      mimeType: string;
      bytes: Uint8Array;
    };

export type StepContextEntry = {
  id: string;
  kind: string;
  title: string;
  content?: StepContextPart[];
  text?: string;
  data?: unknown;
};

export type StepContentSegment = {
  kind: 'message' | 'reasoning' | 'note';
  text: string;
};

export type ActionRequest = {
  name: string;
  input: Record<string, unknown>;
};

export type ActionResult = {
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
};

export type StepContinuation = 'stop' | 'continue' | 'wait';

export type StepModelUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
};

export type StepModelMetadata = {
  provider?: string;
  modelId?: string;
};

export type StepModelRequest = {
  runtimeId: string;
  stepId: string;
  stepNumber: number;
  context: StepContextEntry[];
  actions: StepActionDescriptor[];
  providerOptions?: Record<
    string,
    {
      [key: string]: StepModelJsonValue | undefined;
    }
  >;
};

export type StepModelStreamEvent =
  | {
      type: 'segment-delta';
      segment: StepContentSegment;
    }
  | {
      type: 'action-request';
      actionRequest: ActionRequest;
    };

export type StepModelResponse = {
  segments: StepContentSegment[];
  actionRequests: ActionRequest[];
  continuation: StepContinuation;
  usage?: StepModelUsage;
  metadata?: StepModelMetadata;
};

export type StepModelStream = {
  events: AsyncIterable<StepModelStreamEvent>;
  response: Promise<StepModelResponse>;
};

export type StepActionDescriptor = {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  inputSchemaText: string;
};

export type StepRecord = {
  id: string;
  stepNumber: number;
  inputs: RuntimeInput[];
  context: StepContextEntry[];
  modelResponse: StepModelResponse;
  modelUsage: StepModelUsage | null;
  modelMetadata: StepModelMetadata | null;
  actionResults: ActionResult[];
  continuation: StepContinuation;
  startedAt: string;
  finishedAt: string;
};

export type RuntimeStatus = 'idle' | 'running';

export type RuntimeSnapshot = {
  runtimeId: string;
  status: RuntimeStatus;
  pendingInputs: RuntimeInput[];
  lastActionResults: ActionResult[];
  steps: StepRecord[];
};

export type StepExecutionResult = {
  record: StepRecord;
  snapshot: RuntimeSnapshot;
};

export type RuntimeStepStreamEvent =
  | {
      type: 'segment-delta';
      runtimeId: string;
      stepId: string;
      stepNumber: number;
      segment: StepContentSegment;
    }
  | {
      type: 'action-request';
      runtimeId: string;
      stepId: string;
      stepNumber: number;
      actionRequest: ActionRequest;
    }
  | {
      type: 'action-results';
      runtimeId: string;
      stepId: string;
      stepNumber: number;
      actionResults: ActionResult[];
    }
  | {
      type: 'step-complete';
      runtimeId: string;
      record: StepRecord;
      snapshot: RuntimeSnapshot;
    }
  | {
      type: 'error';
      runtimeId: string;
      stepId: string;
      stepNumber: number;
      error: unknown;
    };

export type RuntimeStepStream = {
  events: AsyncIterable<RuntimeStepStreamEvent>;
  completion: Promise<StepExecutionResult>;
};

export type RunExecutionResult = {
  steps: StepRecord[];
  snapshot: RuntimeSnapshot;
};
