import { buildRecallQueryFromStep as buildRecallQueryFromStepImpl } from './format-helpers';
import type { LtmSearchResult } from '../helpers';

/**
 * Threshold ratio: when a single recall yields >= `RECALL_INJECTION_RAW_WINDOW_RATIO`
 * items per raw-window message, skip injection to avoid context bloat.
 */
export const RECALL_INJECTION_RAW_WINDOW_RATIO = 0.25;

/**
 * Extract a recall query string from a recall step.
 * Thin wrapper around `buildRecallQueryFromStepImpl` — centralized here so
 * the parent class can drop its own wrapper.
 */
export function buildRecallQueryFromStep(step: unknown): string {
  return buildRecallQueryFromStepImpl(step);
}

/**
 * Decide whether recall results should be injected into the agent's context.
 * Skips injection if either:
 *  - rawWindowMessageCount is 0 (no recent messages to inject into)
 *  - recallItemCount (graph sources OR results) is 0 (no recall payload)
 *  - recallItemCount >= floor(rawWindowMessageCount * RECALL_INJECTION_RAW_WINDOW_RATIO)
 *    (i.e., the recall payload would dominate the context window)
 */
export function shouldSkipRecallInjection(input: {
  graph: {
    hit: boolean;
    sourcesCount: number;
  };
  results: LtmSearchResult[];
  rawWindowMessageCount: number;
}): boolean {
  if (input.rawWindowMessageCount <= 0) {
    return false;
  }

  const recallItemCount = input.graph.hit ? input.graph.sourcesCount : input.results.length;

  if (recallItemCount <= 0) {
    return false;
  }

  const limit = Math.max(
    1,
    Math.floor(input.rawWindowMessageCount * RECALL_INJECTION_RAW_WINDOW_RATIO),
  );
  return recallItemCount >= limit;
}
