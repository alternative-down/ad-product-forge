import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PipelineInput, PipelineOutput } from '../../index';
import { buildInsights, runInsightStage } from './insight-engine';
import { createInsightStore } from './insight-store';

describe('insight-engine', () => {
  it('builds structured insights from input content and context', () => {
    const input: PipelineInput = {
      item_id: 'item-3',
      timestamp: '2026-03-06T18:00:00.000Z',
      content: 'O fluxo está lento e com erro frequente no checkout. Erro em pagamento!',
      context: { channel: 'discord', segment: 'ecommerce' },
      source_type: 'manual',
      link: 'https://example.com/thread/123',
    };

    const insights = buildInsights(input);

    expect(insights.length).toBeGreaterThan(0);
    expect(insights[0]?.title).toBe('Primary demand signal');
    expect(insights[0]?.pain_intensity).toBeGreaterThan(20);
    expect(insights[0]?.evidence_strength).toBeLessThanOrEqual(100);
  });

  it('returns output v1, appends artifact id and persists insight history', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'apf-insight-'));
    const store = createInsightStore(dir);

    const input: PipelineInput = {
      item_id: 'item-3',
      timestamp: '2026-03-06T18:00:00.000Z',
      content: 'Muita fricção no onboarding com vários tickets repetidos.',
      context: { channel: 'support' },
      source_type: 'coleta',
    };

    const graphOutput: PipelineOutput = {
      item_id: 'item-3',
      job_id: 'job-3',
      parent_job_id: 'job-2',
      status: 'ok',
      score: null,
      artifacts: ['graph_job-3'],
      processed_at: '2026-03-06T18:01:00.000Z',
    };

    const out = await runInsightStage(input, graphOutput, {
      now: () => new Date('2026-03-06T18:02:00.000Z'),
      store,
    });

    expect(out.status).toBe('ok');
    expect(out.artifacts).toEqual(['graph_job-3', 'insight_job-3']);
    expect(out.processed_at).toBe('2026-03-06T18:02:00.000Z');

    const history = await store.retrieve('job-3');
    expect(history).toHaveLength(1);
    expect(history[0]?.id).toBe('insight_job-3');
    expect(history[0]?.insights.length).toBeGreaterThan(0);
  });

  it('returns retry when previous stage was not successful', async () => {
    const input: PipelineInput = {
      item_id: 'item-4',
      timestamp: '2026-03-06T18:00:00.000Z',
      content: 'placeholder',
      context: {},
      source_type: 'webhook',
    };

    const graphOutput: PipelineOutput = {
      item_id: 'item-4',
      job_id: 'job-4',
      parent_job_id: null,
      status: 'retry',
      score: null,
      artifacts: ['graph_job-4'],
      processed_at: '2026-03-06T18:01:00.000Z',
    };

    const out = await runInsightStage(input, graphOutput, {
      now: () => new Date('2026-03-06T18:02:00.000Z'),
    });

    expect(out.status).toBe('retry');
  });
});
