import type { PipelineInput, PipelineOutput } from '../../index';
import { createInsightStore, type Insight, type InsightArtifact, type InsightStore } from './insight-store';

export interface InsightDeps {
  now?: () => Date;
  store?: InsightStore;
}

const PAIN_HINTS = ['erro', 'falha', 'bug', 'caro', 'lento', 'friccao', 'fricção', 'dificil', 'difícil'];

export function buildInsights(input: PipelineInput): Insight[] {
  const content = input.content.toLowerCase();
  const words = content
    .split(/[^\p{L}\p{N}_-]+/u)
    .map((word) => word.trim())
    .filter(Boolean);

  const frequencies = words.reduce<Map<string, number>>((acc, word) => {
    acc.set(word, (acc.get(word) ?? 0) + 1);
    return acc;
  }, new Map());

  const highestFrequency = Math.max(1, ...frequencies.values());
  const repeatedWords = [...frequencies.values()].filter((count) => count > 1).length;
  const contextSize = Object.keys(input.context ?? {}).length;
  const painHits = PAIN_HINTS.filter((hint) => content.includes(hint)).length;

  const evidenceStrength = clamp(30 + Math.min(50, Math.round(words.length / 2)) + (input.link ? 10 : 0));
  const recurrence = clamp(20 + repeatedWords * 12 + highestFrequency * 8);
  const painIntensity = clamp(15 + painHits * 20 + (content.includes('!') ? 5 : 0));
  const contextBreadth = clamp(20 + contextSize * 18 + (input.link ? 8 : 0));

  const primary: Insight = {
    id: `insight_${input.item_id}_primary`,
    title: 'Primary demand signal',
    summary: summarize(input.content),
    evidence_strength: evidenceStrength,
    recurrence: recurrence,
    pain_intensity: painIntensity,
    context_breadth: contextBreadth,
  };

  if (contextSize === 0) {
    return [primary];
  }

  const contextInsight: Insight = {
    id: `insight_${input.item_id}_context`,
    title: 'Context spread signal',
    summary: `Context keys mapped: ${Object.keys(input.context).join(', ')}`,
    evidence_strength: clamp(evidenceStrength - 8),
    recurrence: clamp(recurrence - 5),
    pain_intensity: clamp(Math.max(0, painIntensity - 10)),
    context_breadth: clamp(contextBreadth + 10),
  };

  return [primary, contextInsight];
}

export async function runInsightStage(
  input: PipelineInput,
  graphOutput: PipelineOutput,
  deps: InsightDeps = {},
): Promise<PipelineOutput> {
  const now = deps.now?.() ?? new Date();
  const store = deps.store ?? createInsightStore();

  if (graphOutput.status !== 'ok') {
    return {
      ...graphOutput,
      status: 'retry',
      processed_at: now.toISOString(),
    };
  }

  try {
    const insights = buildInsights(input);

    const artifact: InsightArtifact = {
      id: `insight_${graphOutput.job_id}`,
      version: '1.0.0',
      created_at: now.toISOString(),
      insights,
    };

    await store.save(artifact, graphOutput.job_id);

    return {
      item_id: graphOutput.item_id,
      job_id: graphOutput.job_id,
      parent_job_id: graphOutput.parent_job_id ?? null,
      status: 'ok',
      score: graphOutput.score ?? null,
      artifacts: [...graphOutput.artifacts, artifact.id],
      processed_at: now.toISOString(),
    };
  } catch {
    return {
      item_id: graphOutput.item_id,
      job_id: graphOutput.job_id,
      parent_job_id: graphOutput.parent_job_id ?? null,
      status: 'error',
      score: graphOutput.score ?? null,
      artifacts: graphOutput.artifacts,
      processed_at: now.toISOString(),
    };
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function summarize(content: string): string {
  const normalized = content.trim();
  if (normalized.length <= 120) {
    return normalized;
  }

  return `${normalized.slice(0, 117)}...`;
}
