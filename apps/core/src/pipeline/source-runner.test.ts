import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runPipelineFromSource } from './source-runner.js';

describe('source runner', () => {
  const now = () => new Date('2026-03-07T00:30:00.000Z');

  it('runs full pipeline from coleta payload', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'apf-source-runner-'));

    const result = await runPipelineFromSource(
      {
        sourceType: 'coleta',
        payload: {
          item_id: 'sr-coleta-1',
          timestamp: '2026-03-07T00:00:00.000Z',
          content: 'Sinal coletado: erro de checkout recorrente',
          context: { channel: 'community' },
          link: 'https://example.com/coleta/100',
        },
      },
      {
        artifactBaseDir: dir,
        now,
        ingestDeps: { generateJobId: () => 'job-sr-coleta-1' },
      },
    );

    expect(result.finalOutput.status).toBe('ok');
    expect(result.nextAction).toBe('forward');
    expect(result.finalOutput.artifacts).toEqual([
      'graph_job-sr-coleta-1',
      'insight_job-sr-coleta-1',
      'score_job-sr-coleta-1',
    ]);
  });

  it('runs full pipeline from manual payload', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'apf-source-runner-'));

    const result = await runPipelineFromSource(
      {
        sourceType: 'manual',
        payload: {
          item_id: 'sr-manual-1',
          timestamp: '2026-03-07T00:00:00.000Z',
          note: 'Equipe reportou fricção de onboarding',
          author: 'nicolas',
          context: { team: 'ops' },
        },
      },
      {
        artifactBaseDir: dir,
        now,
        ingestDeps: { generateJobId: () => 'job-sr-manual-1' },
      },
    );

    expect(result.finalOutput.status).toBe('ok');
    expect(result.nextAction).toBe('forward');
  });

  it('runs full pipeline from webhook payload', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'apf-source-runner-'));

    const result = await runPipelineFromSource(
      {
        sourceType: 'webhook',
        payload: {
          id: 'sr-wh-1',
          occurred_at: '2026-03-07T00:00:00.000Z',
          body: 'Erro webhook em integração',
          meta: { provider: 'stripe' },
          url: 'https://example.com/webhook/200',
        },
      },
      {
        artifactBaseDir: dir,
        now,
        ingestDeps: { generateJobId: () => 'job-sr-webhook-1' },
      },
    );

    expect(result.finalOutput.status).toBe('ok');
    expect(result.nextAction).toBe('forward');
  });
});
