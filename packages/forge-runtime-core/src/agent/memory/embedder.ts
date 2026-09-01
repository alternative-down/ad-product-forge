/* eslint-disable reexport-check/no-unnecessary-reexports, @typescript-eslint/strict-boolean-expressions */
import { cpus } from 'node:os';

import type { FeatureExtractionPipeline } from '@huggingface/transformers';
import { pipeline } from '@huggingface/transformers';
import { EmbeddingModel, FlagEmbedding } from 'fastembed';

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

let fastembedProviderPromise: Promise<WorkspaceEmbedderProvider> | null = null;
const transformersPipelineByEmbedder = new Map<
  Exclude<WorkspaceEmbedderId, 'fastembed'>,
  Promise<FeatureExtractionPipeline>
>();
const transformersProviderByEmbedder = new Map<
  Exclude<WorkspaceEmbedderId, 'fastembed'>,
  WorkspaceEmbedderProvider
>();

export function getFastembedSingleton() {
  if (!fastembedProviderPromise) {
    fastembedProviderPromise = createFastembedProvider();
  }

  return fastembedProviderPromise;
}

export function isWorkspaceEmbedderId(value: string): value is WorkspaceEmbedderId {
  return WORKSPACE_EMBEDDER_IDS.includes(value as WorkspaceEmbedderId);
}

export function resolveWorkspaceEmbedderId(value: string | null | undefined): WorkspaceEmbedderId {
  return value != null && isWorkspaceEmbedderId(value) ? value : 'fastembed';
}

export function getWorkspaceEmbedderProvider(
  embedderId: WorkspaceEmbedderId = 'fastembed',
): WorkspaceEmbedderProvider | Promise<WorkspaceEmbedderProvider> {
  if (embedderId === 'fastembed') {
    return getFastembedSingleton();
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
  const provider = await getWorkspaceEmbedderProvider(embedderId);
  const result = await provider.doEmbed({ values: [text] });
  return result.embeddings[0] ?? [];
}

export async function embedTextWithFastembed(_text: string): Promise<number[]> {
  return await embedTextWithWorkspaceEmbedder('fastembed', _text);
}

async function getTransformersPipeline(
  embedderId: Exclude<WorkspaceEmbedderId, 'fastembed'>,
): Promise<FeatureExtractionPipeline> {
  const existingPipeline = transformersPipelineByEmbedder.get(embedderId);
  if (existingPipeline) {
    return await existingPipeline;
  }

  const pipelinePromise = createTransformersPipeline(embedderId);
  transformersPipelineByEmbedder.set(embedderId, pipelinePromise);
  return await pipelinePromise;
}

async function createFastembedProvider(): Promise<WorkspaceEmbedderProvider> {
  const embeddingModel = await FlagEmbedding.init({
    model: EmbeddingModel.MLE5Large,
  });

  return {
    async doEmbed(input) {
      const embeddings: number[][] = [];

      for await (const batch of embeddingModel.embed(input.values)) {
        embeddings.push(...batch);
      }

      return { embeddings };
    },
  };
}

function createTransformersPipeline(
  embedderId: Exclude<WorkspaceEmbedderId, 'fastembed'>,
): Promise<FeatureExtractionPipeline> {
  return createTransformersPipelineInternal(embedderId);
}

async function createTransformersPipelineInternal(
  embedderId: Exclude<WorkspaceEmbedderId, 'fastembed'>,
): Promise<FeatureExtractionPipeline> {
  if (embedderId === 'transformers-multilingual-e5-small') {
    const activePipeline = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small');
    return activePipeline as unknown as FeatureExtractionPipeline;
  }

  const activePipeline = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', {
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
  });

  return activePipeline as unknown as FeatureExtractionPipeline;
}
