import { type PipelineInput, SOURCE_TYPES, type SourceType, createValidationError, validateInput } from '../index.js';

export interface ColetaPayload {
  item_id: string;
  timestamp: string;
  content: string;
  context?: Record<string, unknown>;
  link?: string;
}

export interface ManualPayload {
  item_id: string;
  timestamp: string;
  note: string;
  author?: string;
  context?: Record<string, unknown>;
  link?: string;
}

export interface WebhookPayload {
  id: string;
  occurred_at: string;
  body: string;
  meta?: Record<string, unknown>;
  url?: string;
}

export type SourcePayload = ColetaPayload | ManualPayload | WebhookPayload;

export function normalizeToPipelineInput(sourceType: SourceType, payload: SourcePayload): PipelineInput {
  if (!SOURCE_TYPES.includes(sourceType)) {
    throw createValidationError(`source_type must be one of: ${SOURCE_TYPES.join(', ')}`);
  }

  const base = normalizeBySource(sourceType, payload);
  validateInput(base);
  return base;
}

function normalizeBySource(sourceType: SourceType, payload: SourcePayload): PipelineInput {
  if (sourceType === 'coleta') {
    const typed = payload as ColetaPayload;
    return {
      item_id: typed.item_id,
      timestamp: typed.timestamp,
      content: typed.content,
      context: typed.context ?? {},
      link: typed.link,
      source_type: 'coleta',
    };
  }

  if (sourceType === 'manual') {
    const typed = payload as ManualPayload;
    return {
      item_id: typed.item_id,
      timestamp: typed.timestamp,
      content: typed.note,
      context: {
        ...(typed.context ?? {}),
        author: typed.author ?? 'unknown',
      },
      link: typed.link,
      source_type: 'manual',
    };
  }

  const typed = payload as WebhookPayload;
  return {
    item_id: typed.id,
    timestamp: typed.occurred_at,
    content: typed.body,
    context: typed.meta ?? {},
    link: typed.url,
    source_type: 'webhook',
  };
}
