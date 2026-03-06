import type { PipelineInput, PipelineOutput } from '../../index';
import { createArtifactStore, type ArtifactStore, type GraphArtifact, type GraphEdge, type GraphNode } from './artifact-store';

export interface GraphTransformDeps {
  now?: () => Date;
  store?: ArtifactStore;
}

export function buildGraphNodes(input: PipelineInput): GraphNode[] {
  const base: GraphNode[] = [
    {
      id: 'content_root',
      type: 'content',
      payload: { text: input.content, source: input.source_type },
      timestamp: input.timestamp,
    },
  ];

  const contextNodes = Object.entries(input.context ?? {}).map(([key, value], index) => ({
    id: `context_${key}_${index}`,
    type: 'context' as const,
    payload: { key, value },
    timestamp: input.timestamp,
  }));

  const linkNodes: GraphNode[] = input.link
    ? [
        {
          id: 'link_ref',
          type: 'reference',
          payload: { url: input.link },
          timestamp: input.timestamp,
        },
      ]
    : [];

  return [...base, ...contextNodes, ...linkNodes];
}

export function buildGraphEdges(nodes: GraphNode[]): GraphEdge[] {
  return nodes
    .filter((node) => node.type === 'context' || node.type === 'reference')
    .map((node) => ({
      source: 'content_root',
      target: node.id,
      relation: node.type === 'context' ? 'has_context' : 'references',
    }));
}

export async function runGraphStage(
  input: PipelineInput,
  ingestOutput: PipelineOutput,
  deps: GraphTransformDeps = {},
): Promise<PipelineOutput> {
  const now = deps.now?.() ?? new Date();
  const store = deps.store ?? createArtifactStore();

  try {
    const nodes = buildGraphNodes(input);
    const edges = buildGraphEdges(nodes);

    const artifact: GraphArtifact = {
      id: `graph_${ingestOutput.job_id}`,
      version: '1.0.0',
      nodes,
      edges,
      created_at: now.toISOString(),
    };

    await store.save(artifact, ingestOutput.job_id);

    return {
      item_id: ingestOutput.item_id,
      job_id: ingestOutput.job_id,
      parent_job_id: ingestOutput.parent_job_id ?? null,
      status: 'ok',
      score: null,
      artifacts: [artifact.id],
      processed_at: now.toISOString(),
    };
  } catch {
    return {
      item_id: ingestOutput.item_id,
      job_id: ingestOutput.job_id,
      parent_job_id: ingestOutput.parent_job_id ?? null,
      status: 'error',
      score: null,
      artifacts: [],
      processed_at: now.toISOString(),
    };
  }
}
