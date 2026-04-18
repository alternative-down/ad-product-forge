import { cpus } from 'node:os';

import type { FeatureExtractionPipeline } from '@huggingface/transformers';
import { pipeline } from '@huggingface/transformers';
import { fastembed } from '@mastra/fastembed';

export const WORKSPACE_EMBEDDER_IDS = [
  'fastembed',
  'transformers-multilingual-e5-small',
  'transformers-multilingual-e5-small-cpu',
] as const;

export type WorkspaceEmbedderId = (typeof WORKSPACE_EMBEDDER_IDS)[number];

type EmbedderResult = {
  embeddings: number[][];
};

export type WorkspaceEmbedderProvider = {
  doEmbed(input: { values: string[] }): Promise<EmbedderResult>;
};

const fastembedProvider = fastembed;
const transformersPipelineByEmbedder = new Map<
  Exclude<WorkspaceEmbedderId, 'fastembed'>,
  Promise<FeatureExtractionPipeline>
>();
const transformersProviderByEmbedder = new Map<
  Exclude<WorkspaceEmbedderId, 'fastembed'>,
  WorkspaceEmbedderProvider
>();

export function getFastembedSingleton() {
  return fastembedProvider;
}

export function isWorkspaceEmbedderId(value: string): value is WorkspaceEmbedderId {
  return WORKSPACE_EMBEDDER_IDS.includes(value as WorkspaceEmbedderId);
}

export function resolveWorkspaceEmbedderId(value: string | null | undefined): WorkspaceEmbedderId {
  return value && isWorkspaceEmbedderId(value) ? value : 'fastembed';
}

export function getWorkspaceEmbedderProvider(
  embedderId: WorkspaceEmbedderId = 'fastembed',
): WorkspaceEmbedderProvider {
  if (embedderId === 'fastembed') {
    return fastembedProvider;
  }

  const existingProvider = transformersProviderByEmbedder.get(embedderId);
  if (existingProvider) {
    return existingProvider;
  }

  const provider: WorkspaceEmbedderProvider = {
    async doEmbed(input) {
      const activePipeline = await getTransformersPipeline(embedderId);
      const result = await activePipeline(input.values, {
        normalize: true,
        pooling: 'mean',
      });

      return {
        embeddings: result.tolist() as number[][],
      };
    },
  };

  transformersProviderByEmbedder.set(embedderId, provider);
  return provider;
}

export async function embedTextWithWorkspaceEmbedder(
  embedderId: WorkspaceEmbedderId,
  text: string,
): Promise<number[]> {
  const result = await getWorkspaceEmbedderProvider(embedderId).doEmbed({ values: [text] });
  return result.embeddings[0] ?? [];
}

export async function embedTextWithFastembed(text: string): Promise<number[]> {
  return embedTextWithWorkspaceEmbedder('fastembed', text);
}

async function getTransformersPipeline(
  embedderId: Exclude<WorkspaceEmbedderId, 'fastembed'>,
): Promise<FeatureExtractionPipeline> {
  const existingPipeline = transformersPipelineByEmbedder.get(embedderId);
  if (existingPipeline) {
    return existingPipeline;
  }

  const pipelinePromise = createTransformersPipeline(embedderId);
  transformersPipelineByEmbedder.set(embedderId, pipelinePromise);
  return pipelinePromise;
}

function createTransformersPipeline(
  embedderId: Exclude<WorkspaceEmbedderId, 'fastembed'>,
): Promise<FeatureExtractionPipeline> {
  if (embedderId === 'transformers-multilingual-e5-small') {
    return pipeline('feature-extraction', 'Xenova/multilingual-e5-small') as Promise<FeatureExtractionPipeline>;
  }

  return pipeline('feature-extraction', 'Xenova/multilingual-e5-small', {
    device: 'cpu',
    session_options: {
      enableCpuMemArena: true,
      enableMemPattern: true,
      enableProfiling: false,
      executionMode: 'parallel',
      graphOptimizationLevel: 'all',
      interOpNumThreads: 1,
      intraOpNumThreads: Math.max(1, Math.floor(cpus().length * 0.8)),
    },
  }) as Promise<FeatureExtractionPipeline>;
}
