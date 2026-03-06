import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface InsightArtifact {
  id: string;
  version: string;
  created_at: string;
  insights: Insight[];
}

export interface Insight {
  id: string;
  title: string;
  summary: string;
  evidence_strength: number;
  recurrence: number;
  pain_intensity: number;
  context_breadth: number;
}

export interface InsightStore {
  save: (artifact: InsightArtifact, jobId: string) => Promise<void>;
  retrieve: (jobId: string) => Promise<InsightArtifact[]>;
  getLatest: (jobId: string) => Promise<InsightArtifact | undefined>;
}

export function createInsightStore(baseDir = './artifacts'): InsightStore {
  const byJob = new Map<string, InsightArtifact[]>();

  async function save(artifact: InsightArtifact, jobId: string): Promise<void> {
    const history = byJob.get(jobId) ?? [];
    byJob.set(jobId, [...history, artifact]);

    await mkdir(join(baseDir, jobId), { recursive: true });
    const filePath = join(baseDir, jobId, `${artifact.id}_${artifact.version}.json`);
    await writeFile(filePath, JSON.stringify(artifact, null, 2), 'utf8');
  }

  async function retrieve(jobId: string): Promise<InsightArtifact[]> {
    return byJob.get(jobId) ?? [];
  }

  async function getLatest(jobId: string): Promise<InsightArtifact | undefined> {
    const history = byJob.get(jobId) ?? [];
    return history.at(-1);
  }

  return { save, retrieve, getLatest };
}
