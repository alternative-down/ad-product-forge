# D2: Graph Stage - Definition of Done

## Objective
Transform validated ingest output into a structured graph representation (nodes/edges), persist artifacts with version history, and return contract v1 output.

## Acceptance Criteria

### Input Validation
- [x] Accept `PipelineOutputV1` from D1 (ingest)
- [x] Validate `job_id` presence and format
- [x] Accept `PipelineInputV1` for enrichment context

### Graph Transformation
- [x] Extract content into root node
- [x] Build context nodes from `context` object
- [x] Add reference nodes (e.g., links)
- [x] Create edges with relation types (e.g., `has_context`, `references`)
- [x] Generate artifact ID: `graph_{job_id}`

### Artifact Persistence
- [x] Store artifact in-memory with versioning
- [x] Persist to filesystem (no overwrite, append version)
- [x] Include timestamp and version metadata
- [x] Maintain artifact history per `job_id`

### Output Contract
- [x] Return `PipelineOutputV1` with:
  - `status`: "ok" | "retry" | "error"
  - `artifacts`: Array of artifact IDs (e.g., `["graph_{job_id}"]`)
  - `processed_at`: ISO 8601 timestamp
  - All other fields preserved

### Error Handling
- [x] Catch transformation errors
- [x] Return status="error" with empty artifacts
- [x] Maintain output structure integrity

### Testing
- [x] Unit tests for node building
- [x] Unit tests for edge creation
- [x] Integration test: transform → persist → retrieve
- [x] Error case coverage

## Implementation Details

### Modules
- `GraphTransformer`: Core transformation logic
- `ArtifactStore`: In-memory + filesystem persistence with versioning

### Key Types
```typescript
interface GraphNode {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

interface GraphArtifact {
  id: string;
  version: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  created_at: string;
}
```

### Rules
- Context is treated as raw nodes (no filtering)
- Artifacts maintain full history (versioning = no overwrite)
- Status mapping: Internal; D3 (insight) handles interpretation

## Done Definition
- Code implements all criteria above
- Tests pass locally (`npm test --workspace @ad-product-forge/core`)
- TypeScript strict mode passes (`npm run typecheck`)
- Build succeeds (`npm run build`)
- PR opened with acceptance criteria checklist
