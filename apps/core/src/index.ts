export const SOURCE_TYPES = ['coleta', 'manual', 'webhook'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const STATUS_TYPES = ['ok', 'retry', 'error'] as const;
export type PipelineStatus = (typeof STATUS_TYPES)[number];

export interface PipelineInput {
  item_id: string;
  timestamp: string;
  content: string;
  context: Record<string, unknown>;
  link?: string;
  source_type: SourceType;
}

export interface PipelineOutput {
  item_id: string;
  job_id: string;
  parent_job_id?: string | null;
  status: PipelineStatus;
  score?: number | null;
  artifacts: string[];
  processed_at: string;
}

export interface RawPayloadRecord {
  item_id: string;
  job_id: string;
  parent_job_id?: string | null;
  received_at: string;
  payload: PipelineInput;
}

export interface IngestDependencies {
  generateJobId?: () => string;
  now?: () => Date;
  persistRawPayload?: (record: RawPayloadRecord) => Promise<void> | void;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateInput(input: PipelineInput): void {
  if (!input.item_id || input.item_id.trim().length === 0) {
    throw new ValidationError('item_id is required');
  }

  if (!input.content || input.content.trim().length === 0) {
    throw new ValidationError('content is required');
  }

  if (!(input.context && typeof input.context === 'object' && !Array.isArray(input.context))) {
    throw new ValidationError('context must be an object');
  }

  if (!SOURCE_TYPES.includes(input.source_type)) {
    throw new ValidationError(`source_type must be one of: ${SOURCE_TYPES.join(', ')}`);
  }

  if (!isValidIsoDate(input.timestamp)) {
    throw new ValidationError('timestamp must be a valid ISO-8601 date-time');
  }

  if (input.link && !isValidUrl(input.link)) {
    throw new ValidationError('link must be a valid URL');
  }
}

export async function ingest(
  input: PipelineInput,
  deps: IngestDependencies = {},
  parentJobId?: string | null,
): Promise<PipelineOutput> {
  validateInput(input);

  const now = deps.now?.() ?? new Date();
  const jobId = deps.generateJobId?.() ?? randomId();

  const record: RawPayloadRecord = {
    item_id: input.item_id,
    job_id: jobId,
    parent_job_id: parentJobId ?? null,
    received_at: now.toISOString(),
    payload: input,
  };

  await deps.persistRawPayload?.(record);

  return {
    item_id: input.item_id,
    job_id: jobId,
    parent_job_id: parentJobId ?? null,
    status: 'ok',
    score: null,
    artifacts: [],
    processed_at: now.toISOString(),
  };
}

function randomId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isValidIsoDate(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && value.includes('T');
}

function isValidUrl(value: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
