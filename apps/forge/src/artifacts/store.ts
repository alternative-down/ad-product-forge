import { createHash } from 'node:crypto';
import { eq, and, desc } from 'drizzle-orm';
import type { Database } from '../database/index';
import { generatedArtifacts } from '../database/schema';
import { createId } from '../utils/id';

export type ArtifactType = 'minimax_tts' | 'minimax_image';
export type GeneratedArtifact = typeof generatedArtifacts.$inferSelect;
export type GeneratedArtifactInsert = typeof generatedArtifacts.$inferInsert;

export type TtsInputHash = {
  text: string;
  voiceId: string;
  speed?: number;
  volume?: number;
  pitch?: number;
  languageBoost?: string;
  outputFormat?: string;
};

export type ImageInputHash = {
  prompt: string;
  aspectRatio?: string;
  model?: string;
  referenceImagePath?: string;
};

export function hashTtsInput(input: TtsInputHash): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export function hashImageInput(input: ImageInputHash): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export function createArtifactStore(db: Database) {
  async function registerArtifact(input: {
    agentId: string;
    toolId: ArtifactType;
    filePath: string;
    mimeType?: string;
    promptHash: string;
    inputHash: string;
    metadata?: Record<string, unknown>;
  }): Promise<GeneratedArtifact> {
    const artifact: GeneratedArtifactInsert = {
      artifactId: createId(),
      agentId: input.agentId,
      toolId: input.toolId,
      filePath: input.filePath,
      mimeType: input.mimeType ?? null,
      promptHash: input.promptHash,
      inputHash: input.inputHash,
      metadata: input.metadata ?? null,
      createdAt: Date.now(),
    };
    await db.insert(generatedArtifacts).values(artifact);
    return artifact as GeneratedArtifact;
  }

  async function findByInputHash(agentId: string, toolId: ArtifactType, inputHash: string): Promise<GeneratedArtifact | null> {
    const rows = await db.select().from(generatedArtifacts).where(
      and(
        eq(generatedArtifacts.agentId, agentId),
        eq(generatedArtifacts.toolId, toolId),
        eq(generatedArtifacts.inputHash, inputHash),
      )
    ).limit(1);
    return rows[0] as GeneratedArtifact ?? null;
  }

  async function listByAgent(agentId: string, toolId?: ArtifactType, limit = 50): Promise<GeneratedArtifact[]> {
    const conditions = [eq(generatedArtifacts.agentId, agentId)];
    if (toolId) {
      conditions.push(eq(generatedArtifacts.toolId, toolId));
    }
    return await db.select().from(generatedArtifacts)
      .where(and(...conditions))
      .orderBy(desc(generatedArtifacts.createdAt))
      .limit(limit) as GeneratedArtifact[];
  }

  async function deleteArtifact(artifactId: string): Promise<void> {
    await db.delete(generatedArtifacts).where(eq(generatedArtifacts.artifactId, artifactId));
  }

  return { registerArtifact, findByInputHash, listByAgent, deleteArtifact };
}