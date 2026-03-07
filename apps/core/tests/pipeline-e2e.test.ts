import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createArtifactStore,
  createInsightStore,
  ingest,
  runGraphStage,
  runInsightStage,
  runScoreStage,
  type PipelineInput,
} from '../src/index';

describe('pipeline e2e', () => {
  const fixedNow = () => new Date('2026-03-06T22:00:00.000Z');

  async function runFullPipeline(input: PipelineInput, jobId: string) {
    const graphDir = await mkdtemp(join(tmpdir(), 'apf-e2e-graph-'));
    const insightDir = await mkdtemp(join(tmpdir(), 'apf-e2e-insight-'));

    const ingestOutput = await ingest(input, {
      now: fixedNow,
      generateJobId: () => jobId,
    });

    const graphOutput = await runGraphStage(input, ingestOutput, {
      now: fixedNow,
      store: createArtifactStore(graphDir),
    });

    const insightStore = createInsightStore(insightDir);
    const insightOutput = await runInsightStage(input, graphOutput, {
      now: fixedNow,
      store: insightStore,
    });

    const scoreOutput = await runScoreStage(insightOutput, {
      now: fixedNow,
      insightStore,
    });

    return { ingestOutput, graphOutput, insightOutput, scoreOutput };
  }

  it('runs e2e for coleta source', async () => {
    const input: PipelineInput = {
      item_id: 'item-coleta',
      timestamp: '2026-03-06T21:55:00.000Z',
      content: 'Erro recorrente no checkout para novos usuários',
      context: { channel: 'community', region: 'br' },
      link: 'https://example.com/coleta/1',
      source_type: 'coleta',
    };

    const result = await runFullPipeline(input, 'job-coleta');

    expect(result.ingestOutput.status).toBe('ok');
    expect(result.graphOutput.status).toBe('ok');
    expect(result.insightOutput.status).toBe('ok');
    expect(result.scoreOutput.status).toBe('ok');
    expect(result.scoreOutput.score).toBeGreaterThanOrEqual(0);
    expect(result.scoreOutput.score).toBeLessThanOrEqual(100);
    expect(result.scoreOutput.artifacts).toEqual(['graph_job-coleta', 'insight_job-coleta', 'score_job-coleta']);
  });

  it('runs e2e for manual source', async () => {
    const input: PipelineInput = {
      item_id: 'item-manual',
      timestamp: '2026-03-06T21:55:00.000Z',
      content: 'Equipe reportou fricção no onboarding e dúvida de preço',
      context: { channel: 'sales', owner: 'ops' },
      source_type: 'manual',
    };

    const result = await runFullPipeline(input, 'job-manual');

    expect(result.ingestOutput.status).toBe('ok');
    expect(result.graphOutput.status).toBe('ok');
    expect(result.insightOutput.status).toBe('ok');
    expect(result.scoreOutput.status).toBe('ok');
    expect(result.scoreOutput.artifacts).toEqual(['graph_job-manual', 'insight_job-manual', 'score_job-manual']);
  });

  it('runs e2e for webhook source', async () => {
    const input: PipelineInput = {
      item_id: 'item-webhook',
      timestamp: '2026-03-06T21:55:00.000Z',
      content: 'Falha intermitente em integração API no plano starter',
      context: { channel: 'webhook', provider: 'stripe' },
      source_type: 'webhook',
    };

    const result = await runFullPipeline(input, 'job-webhook');

    expect(result.ingestOutput.status).toBe('ok');
    expect(result.graphOutput.status).toBe('ok');
    expect(result.insightOutput.status).toBe('ok');
    expect(result.scoreOutput.status).toBe('ok');
    expect(result.scoreOutput.artifacts).toEqual(['graph_job-webhook', 'insight_job-webhook', 'score_job-webhook']);
  });
});
