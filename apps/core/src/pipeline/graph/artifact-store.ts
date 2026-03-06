import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface GraphNode {
  id: string;
  type: 'content' | 'context' | 'reference';
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: 'has_context' | 'references';
}

export interface GraphArtifact {
  id: string;
  version: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  created_at: string;
}

export interface ArtifactStore {
  save: (artifact: GraphArtifact, jobId: string) => Promise<void>;
  retrieve: (jobId: string) => Promise<GraphArtifact[]>;
  getLatest: (jobId: string) => Promise<GraphArtifact | undefined>;
}

export function createArtifactStore(baseDir = './artifacts'): ArtifactStore {
  const byJob = new Map<string, GraphArtifact[]>();

  async function save(artifact: GraphArtifact, jobId: string): Promise<void> {
    const history = byJob.get(jobId) ?? [];
    byJob.set(jobId, [...history, artifact]);

    await mkdir(join(baseDir, jobId), { recursive: true });
    const filePath = join(baseDir, jobId, `${artifact.id}_${artifact.version}.json`);
    await writeFile(filePath, JSON.stringify(artifact, null, 2), 'utf8');
  }

  async function retrieve(jobId: string): Promise<GraphArtifact[]> {
    return byJob.get(jobId) ?? [];
  }

  async function getLatest(jobId: string): Promise<GraphArtifact | undefined> {
    const history = byJob.get(jobId) ?? [];
    return history.at(-1);
  }

  return { save, retrieve, getLatest };
}
