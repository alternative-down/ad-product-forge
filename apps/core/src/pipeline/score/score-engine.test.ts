import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PipelineOutput } from '../../index.js';
import { createInsightStore } from '../insight/insight-store.js';
import { computeWeightedScore, runScoreStage } from './score-engine.js';

describe('score-engine', () => {
  it('computes weighted score using v1 formula', () => {
    const score = computeWeightedScore({
      evidenceStrength: 80,
      recurrence: 70,
      painIntensity: 60,
      contextBreadth: 50,
    });

    expect(score).toBe(69);
  });

  it('returns output v1 with final score and score artifact', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'apf-score-'));
    const insightStore = createInsightStore(dir);

    await insightStore.save(
      {
        id: 'insight_job-5',
        version: '1.0.0',
        created_at: '2026-03-06T19:00:00.000Z',
        insights: [
          {
            id: 'insight-1',
            title: 'signal',
            summary: 'summary',
            evidence_strength: 80,
            recurrence: 60,
            pain_intensity: 70,
            context_breadth: 50,
          },
          {
            id: 'insight-2',
            title: 'signal-2',
            summary: 'summary-2',
            evidence_strength: 65,
            recurrence: 65,
            pain_intensity: 65,
            context_breadth: 65,
          },
        ],
      },
      'job-5',
    );

    const insightOutput: PipelineOutput = {
      item_id: 'item-5',
      job_id: 'job-5',
      parent_job_id: null,
      status: 'ok',
      score: null,
      artifacts: ['graph_job-5', 'insight_job-5'],
      processed_at: '2026-03-06T19:01:00.000Z',
    };

    const out = await runScoreStage(insightOutput, {
      now: () => new Date('2026-03-06T19:02:00.000Z'),
      insightStore,
    });

    expect(out.status).toBe('ok');
    expect(out.score).toBe(68);
    expect(out.artifacts).toEqual(['graph_job-5', 'insight_job-5', 'score_job-5']);
    expect(out.processed_at).toBe('2026-03-06T19:02:00.000Z');
  });

  it('returns retry when there is no insight artifact yet', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'apf-score-empty-'));
    const insightStore = createInsightStore(dir);

    const insightOutput: PipelineOutput = {
      item_id: 'item-6',
      job_id: 'job-6',
      parent_job_id: null,
      status: 'ok',
      score: null,
      artifacts: ['graph_job-6', 'insight_job-6'],
      processed_at: '2026-03-06T19:01:00.000Z',
    };

    const out = await runScoreStage(insightOutput, {
      now: () => new Date('2026-03-06T19:02:00.000Z'),
      insightStore,
    });

    expect(out.status).toBe('retry');
  });
});
