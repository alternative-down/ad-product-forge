export type EmbeddingRequest = {
  texts: string[];
};

export type EmbeddingResponse = {
  vectors: number[][];
  dimensions: number;
};

export interface TextEmbedder {
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}
