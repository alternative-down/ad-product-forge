import { fastembed } from '@mastra/fastembed';

let fastembedSingleton: typeof fastembed | null = null;

export function getFastembedSingleton() {
  if (fastembedSingleton) {
    return fastembedSingleton;
  }

  fastembedSingleton = fastembed;
  return fastembedSingleton;
}

export async function embedTextWithFastembed(text: string): Promise<number[]> {
  const result = await getFastembedSingleton().doEmbed({ values: [text] });
  return result.embeddings[0] ?? [];
}
