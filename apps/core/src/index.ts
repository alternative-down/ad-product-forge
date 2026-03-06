// Pipeline Contract v1
export * from "./pipeline/contracts/v1";

// Graph stage (D2)
export { GraphTransformer, type GraphNode, type GraphEdge, type GraphArtifact } from "./pipeline/graph/graph-transformer";
export { ArtifactStore } from "./pipeline/graph/artifact-store";

// Legacy
export function hello(name: string): string {
  return `hello, ${name}`;
}
