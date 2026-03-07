import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PipelineOutput } from '../../index.js';
import type { InsightArtifact, InsightStore } from '../insight/insight-store.js';

export interface ScoreArtifact {
  id: string;
  version: string;
  created_at: string;
  formula: string;
  insight_scores: Array<{ insight_id: string; value: number }>;
  final_score: number;
}

export interface ScoreStore {
  save: (artifact: ScoreArtifact, jobId: string) => Promise<void>;
}

export interface ScoreDeps {
  now?: () => Date;
  insightStore: InsightStore;
  scoreStore?: ScoreStore;
}

export function computeWeightedScore(params: {
  evidenceStrength: number;
  recurrence: number;
  painIntensity: number;
  contextBreadth: number;
}): number {
  const value =
    params.evidenceStrength * 0.35 +
    params.recurrence * 0.3 +
    params.painIntensity * 0.2 +
    params.contextBreadth * 0.15;

  return clamp(Math.round(value));
}

export async function runScoreStage(outputFromInsight: PipelineOutput, deps: ScoreDeps): Promise<PipelineOutput> {
  const now = deps.now?.() ?? new Date();

  if (outputFromInsight.status !== 'ok') {
    return {
      ...outputFromInsight,
      processed_at: now.toISOString(),
    };
  }

  try {
    const latestInsight = await deps.insightStore.getLatest(outputFromInsight.job_id);
    if (!latestInsight) {
      return {
        ...outputFromInsight,
        status: 'retry',
        processed_at: now.toISOString(),
      };
    }

    const scoredInsights = latestInsight.insights.map((insight) => ({
      insight_id: insight.id,
      value: computeWeightedScore({
        evidenceStrength: insight.evidence_strength,
        recurrence: insight.recurrence,
        painIntensity: insight.pain_intensity,
        contextBreadth: insight.context_breadth,
      }),
    }));

    const finalScore = scoredInsights.length === 0 ? 0 : Math.max(...scoredInsights.map((entry) => entry.value));

    const scoreArtifact: ScoreArtifact = {
      id: `score_${outputFromInsight.job_id}`,
      version: '1.0.0',
      created_at: now.toISOString(),
      formula: '0.35 evidence_strength + 0.30 recurrence + 0.20 pain_intensity + 0.15 context_breadth',
      insight_scores: scoredInsights,
      final_score: finalScore,
    };

    const scoreStore = deps.scoreStore ?? createScoreStore();
    await scoreStore.save(scoreArtifact, outputFromInsight.job_id);

    return {
      item_id: outputFromInsight.item_id,
      job_id: outputFromInsight.job_id,
      parent_job_id: outputFromInsight.parent_job_id ?? null,
      status: 'ok',
      score: finalScore,
      artifacts: [...outputFromInsight.artifacts, scoreArtifact.id],
      processed_at: now.toISOString(),
    };
  } catch {
    return {
      ...outputFromInsight,
      status: 'error',
      processed_at: now.toISOString(),
    };
  }
}

export function createScoreStore(baseDir = './artifacts'): ScoreStore {
  return {
    save: async (artifact: ScoreArtifact, jobId: string) => {
      await mkdir(join(baseDir, jobId), { recursive: true });
      const filePath = join(baseDir, jobId, `${artifact.id}_${artifact.version}.json`);
      await writeFile(filePath, JSON.stringify(artifact, null, 2), 'utf8');
    },
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}
