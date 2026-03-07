import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PipelineInput } from '../index.js';
import { runPipelineV1 } from './orchestrator.js';

describe('pipeline orchestrator', () => {
  it('runs full pipeline and maps nextAction=forward on happy path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'apf-orchestrator-'));

    const input: PipelineInput = {
      item_id: 'item-orch-1',
      timestamp: '2026-03-06T23:50:00.000Z',
      content: 'Erro recorrente em upgrade de plano para usuário recorrente',
      context: { channel: 'support', region: 'br' },
      source_type: 'manual',
    };

    const result = await runPipelineV1(input, {
      artifactBaseDir: dir,
      now: () => new Date('2026-03-06T23:55:00.000Z'),
      ingestDeps: {
        generateJobId: () => 'job-orch-1',
      },
    });

    expect(result.stage).toBe('score');
    expect(result.nextAction).toBe('forward');
    expect(result.finalOutput.status).toBe('ok');
    expect(result.finalOutput.job_id).toBe('job-orch-1');
    expect(result.finalOutput.artifacts).toEqual(['graph_job-orch-1', 'insight_job-orch-1', 'score_job-orch-1']);
    expect(result.finalOutput.score).toBeGreaterThanOrEqual(0);
  });

  it('returns drop when graph stage fails', async () => {
    const input: PipelineInput = {
      item_id: 'item-orch-2',
      timestamp: '2026-03-06T23:50:00.000Z',
      content: 'conteúdo válido',
      context: { source: 'test' },
      source_type: 'coleta',
    };

    const result = await runPipelineV1(input, {
      now: () => new Date('2026-03-06T23:55:00.000Z'),
      ingestDeps: {
        generateJobId: () => 'job-orch-2',
      },
      graphStore: {
        save: async () => {
          throw new Error('forced failure');
        },
        retrieve: async () => [],
        getLatest: async () => undefined,
      },
    });

    expect(result.stage).toBe('graph');
    expect(result.nextAction).toBe('drop');
    expect(result.finalOutput.status).toBe('error');
    expect(result.finalOutput.job_id).toBe('job-orch-2');
  });
});
