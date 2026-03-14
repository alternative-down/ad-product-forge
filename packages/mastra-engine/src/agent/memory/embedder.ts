import { fastembed } from '@mastra/fastembed';

export async function embedTextWithFastembed(text: string): Promise<number[]> {
  const result = await fastembed.doEmbed({ values: [text] });
  return result.embeddings[0] ?? [];
}
