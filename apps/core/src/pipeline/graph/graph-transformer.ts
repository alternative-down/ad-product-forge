import { PipelineInputV1, PipelineOutputV1 } from "../contracts/v1";
import { ArtifactStore } from "./artifact-store";

export interface GraphNode {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

export interface GraphArtifact {
  id: string;
  version: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  created_at: string;
}

export class GraphTransformer {
  private artifactStore: ArtifactStore;

  constructor(artifactStore: ArtifactStore) {
    this.artifactStore = artifactStore;
  }

  /**
   * Transform ingest output into graph structure
   * Implements D2 (graph) stage of pipeline
   */
  async transform(
    input: PipelineInputV1,
    ingestOutput: PipelineOutputV1
  ): Promise<PipelineOutputV1> {
    try {
      // Build graph from content + context
      const nodes = this.buildNodes(input);
      const edges = this.buildEdges(nodes, input);

      // Create artifact
      const artifact: GraphArtifact = {
        id: `graph_${ingestOutput.job_id}`,
        version: "1.0.0",
        nodes,
        edges,
        created_at: new Date().toISOString(),
      };

      // Persist artifact with versioning
      await this.artifactStore.save(artifact, ingestOutput.job_id);

      // Return output v1 with graph artifacts
      return {
        item_id: input.item_id,
        job_id: ingestOutput.job_id,
        parent_job_id: ingestOutput.parent_job_id,
        status: "ok",
        score: undefined,
        artifacts: [artifact.id],
        processed_at: new Date().toISOString(),
      };
    } catch (error) {
      return {
        item_id: input.item_id,
        job_id: ingestOutput.job_id,
        parent_job_id: ingestOutput.parent_job_id,
        status: "error",
        score: undefined,
        artifacts: [],
        processed_at: new Date().toISOString(),
      };
    }
  }

  private buildNodes(input: PipelineInputV1): GraphNode[] {
    const nodes: GraphNode[] = [];

    // Root node from content
    nodes.push({
      id: `content_root`,
      type: "content",
      payload: { text: input.content, source: input.source_type },
      timestamp: input.timestamp,
    });

    // Context nodes
    if (input.context && typeof input.context === "object") {
      Object.entries(input.context).forEach(([key, value], idx) => {
        nodes.push({
          id: `context_${key}_${idx}`,
          type: "context",
          payload: { key, value },
          timestamp: input.timestamp,
        });
      });
    }

    // Link node (if present)
    if (input.link) {
      nodes.push({
        id: `link_ref`,
        type: "reference",
        payload: { url: input.link },
        timestamp: input.timestamp,
      });
    }

    return nodes;
  }

  private buildEdges(nodes: GraphNode[], input: PipelineInputV1): GraphEdge[] {
    const edges: GraphEdge[] = [];

    // Content -> Context connections
    nodes.forEach((node) => {
      if (node.type === "context") {
        edges.push({
          source: "content_root",
          target: node.id,
          relation: "has_context",
        });
      }

      // Content -> Link connection
      if (node.type === "reference") {
        edges.push({
          source: "content_root",
          target: node.id,
          relation: "references",
        });
      }
    });

    return edges;
  }
}
