import { beforeEach, describe, expect, it } from "vitest";
import { GraphTransformer } from "./graph-transformer";
import { ArtifactStore } from "./artifact-store";
import { PipelineInputV1, PipelineOutputV1 } from "../contracts/v1";

describe("GraphTransformer", () => {
  let transformer: GraphTransformer;
  let artifactStore: ArtifactStore;

  beforeEach(() => {
    artifactStore = new ArtifactStore("./test-artifacts");
    transformer = new GraphTransformer(artifactStore);
  });

  it("should transform ingest output to graph artifact", async () => {
    const input: PipelineInputV1 = {
      item_id: "test_001",
      timestamp: new Date().toISOString(),
      content: "Test content",
      context: { source: "manual", priority: "high" },
      link: "https://example.com",
      source_type: "manual",
    };

    const ingestOutput: PipelineOutputV1 = {
      item_id: "test_001",
      job_id: "job_abc123",
      status: "ok",
      artifacts: [],
      processed_at: new Date().toISOString(),
    };

    const result = await transformer.transform(input, ingestOutput);

    expect(result.status).toBe("ok");
    expect(result.job_id).toBe("job_abc123");
    expect(result.artifacts.length).toBeGreaterThan(0);
    expect(result.processed_at).toBeDefined();
  });

  it("should build nodes from content and context", async () => {
    const input: PipelineInputV1 = {
      item_id: "test_002",
      timestamp: new Date().toISOString(),
      content: "Content with context",
      context: { key1: "value1", key2: "value2" },
      source_type: "webhook",
    };

    const ingestOutput: PipelineOutputV1 = {
      item_id: "test_002",
      job_id: "job_xyz789",
      status: "ok",
      artifacts: [],
      processed_at: new Date().toISOString(),
    };

    const result = await transformer.transform(input, ingestOutput);

    expect(result.artifacts.length).toBeGreaterThan(0);
    expect(result.status).toBe("ok");
  });

  it("should handle errors gracefully", async () => {
    const input: PipelineInputV1 = {
      item_id: "test_003",
      timestamp: new Date().toISOString(),
      content: "",
      context: null as any,
      source_type: "coleta",
    };

    const ingestOutput: PipelineOutputV1 = {
      item_id: "test_003",
      job_id: "job_error",
      status: "ok",
      artifacts: [],
      processed_at: new Date().toISOString(),
    };

    const result = await transformer.transform(input, ingestOutput);

    // Should still return valid output structure even on error
    expect(result.item_id).toBe("test_003");
    expect(result.job_id).toBe("job_error");
  });
});
