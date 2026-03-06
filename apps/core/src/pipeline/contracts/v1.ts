/**
 * Pipeline Contract v1
 * Single source of truth for input/output contracts
 */

export interface PipelineInputV1 {
  item_id: string;
  timestamp: string; // ISO 8601
  content: string;
  context: Record<string, unknown>;
  link?: string;
  source_type: "coleta" | "manual" | "webhook";
}

export interface PipelineOutputV1 {
  item_id: string;
  job_id: string;
  parent_job_id?: string | null;
  status: "ok" | "retry" | "error";
  score?: number | null; // 0-100
  artifacts: string[]; // ids/refs
  processed_at: string; // ISO 8601
}

/**
 * Status to next_action mapping (implicit)
 * ok -> forward
 * retry -> retry
 * error -> drop
 */
export const STATUS_MAPPING: Record<PipelineOutputV1["status"], string> = {
  ok: "forward",
  retry: "retry",
  error: "drop",
};
