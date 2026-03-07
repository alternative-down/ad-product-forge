import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PipelineInput, PipelineOutput } from '../../index.js';
import { createArtifactStore } from './artifact-store.js';
import { buildGraphEdges, buildGraphNodes, runGraphStage } from './graph-transformer.js';

describe('graph-transformer', () => {
  it('builds nodes from content, context and optional link', () => {
    const input: PipelineInput = {
      item_id: 'item-1',
      timestamp: '2026-03-06T16:00:00.000Z',
      content: 'some content',
      context: { source: 'forum', score: 2 },
      link: 'https://example.com',
      source_type: 'coleta',
    };

    const nodes = buildGraphNodes(input);
    expect(nodes.length).toBe(4);
    expect(nodes[0]?.id).toBe('content_root');
  });

  it('builds edges from content root to context/reference nodes', () => {
    const nodes = [
      { id: 'content_root', type: 'content', payload: {}, timestamp: '2026-03-06T16:00:00.000Z' },
      { id: 'context_a_0', type: 'context', payload: {}, timestamp: '2026-03-06T16:00:00.000Z' },
      { id: 'link_ref', type: 'reference', payload: {}, timestamp: '2026-03-06T16:00:00.000Z' },
    ] as const;

    const edges = buildGraphEdges([...nodes]);
    expect(edges).toHaveLength(2);
    expect(edges[0]?.relation).toBe('has_context');
    expect(edges[1]?.relation).toBe('references');
  });

  it('returns output v1 and persists artifact history', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'apf-graph-'));
    const store = createArtifactStore(dir);

    const input: PipelineInput = {
      item_id: 'item-2',
      timestamp: '2026-03-06T16:00:00.000Z',
      content: 'pain signal',
      context: { channel: 'discord' },
      source_type: 'manual',
    };

    const ingestOutput: PipelineOutput = {
      item_id: 'item-2',
      job_id: 'job-2',
      status: 'ok',
      artifacts: [],
      processed_at: '2026-03-06T16:01:00.000Z',
      score: null,
      parent_job_id: null,
    };

    const out = await runGraphStage(input, ingestOutput, {
      now: () => new Date('2026-03-06T16:02:00.000Z'),
      store,
    });

    expect(out.status).toBe('ok');
    expect(out.artifacts[0]).toBe('graph_job-2');
    expect(out.processed_at).toBe('2026-03-06T16:02:00.000Z');

    const history = await store.retrieve('job-2');
    expect(history).toHaveLength(1);
    expect(history[0]?.id).toBe('graph_job-2');
  });
});
