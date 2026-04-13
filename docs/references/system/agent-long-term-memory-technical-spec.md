# Agent Long-Term Memory Technical Spec

## Status
- Working Spec
- Branch: `develop`
- Scope: technical implementation plan for the workspace-based long-term memory system

## Inputs
This spec is derived from:
- [agent-memory-redesign.md](/home/nicolas/Documentos/github/ad-product-forge/docs/references/system/agent-memory-redesign.md)
- [agent-memory-technical-spec.md](/home/nicolas/Documentos/github/ad-product-forge/docs/references/system/agent-memory-technical-spec.md)
- [agent-long-term-memory-redesign.md](/home/nicolas/Documentos/github/ad-product-forge/docs/references/system/agent-long-term-memory-redesign.md)

## Technical Goal
Implement long-term memory as a file-based, asynchronous subsystem that:
- receives material only from checkpoint advancement
- writes immutable checkpoint packages to `workspace-memory/checkpoints`
- maintains mutable synthesized knowledge under `workspace-memory/memory`
- runs outside the main agent processor path

The system should reuse the current agent/runtime infrastructure where it helps:
- workspace
- runner lifecycle
- contracts and delays
- communication between agent and internal modules
- step logging

The system should not reuse the old synchronous LTM processor model.

## Boundaries

### What active OM does
- manages active context
- generates observations
- generates reflections
- advances checkpoints
- emits checkpoint packages

### What LTM does
- reads checkpoint packages
- studies durable historical material
- maintains `/memory`
- optionally exposes retrieval later

### What LTM does not do
- shape the main step-time prompt synchronously
- mutate active OM state
- write back into the live thread path

## File System Model

### Base path
Per-agent LTM workspace stays in the existing dedicated memory workspace.

Expected root:
- `workspace-memory/`

### Required directories
- `workspace-memory/checkpoints/`
- `workspace-memory/memory/`

### Checkpoint package directory
Each checkpoint advancement creates one new package:

```text
workspace-memory/checkpoints/<checkpoint-slug>/
  README.md
  reflections/
    reflection_001.md
    reflection_002.md
  observations/
    observation_0001.md
    observation_0002.md
```

Recommended slug shape:
- `<yyyy-mm-dd>_<sequence>`

Example:
- `2026-04-13_001`

## Checkpoint Package Contents

### `README.md`
Primary summary document for the package.

It should contain:
- checkpoint summary text
- basic metadata header/frontmatter or equivalent

Suggested metadata:
- `agentId`
- `threadId`
- `checkpointGeneration`
- `fromGeneration`
- `toGeneration`
- `createdAt`
- `reflectionCount`
- `observationCount`

### `reflections/`
One file per reflection moved behind the checkpoint.

Suggested filename:
- `reflection_001.md`

Each file should contain:
- reflection text
- generation number
- created timestamp
- token count if available

### `observations/`
Optional evidence layer attached to the checkpoint package.

One file per observation block covered by the archived reflection region.

Suggested filename:
- `observation_0001.md`

This should be treated as supporting evidence, not the primary memory document.

## Checkpoint Writer
Checkpoint package creation should be deterministic code, not an agent task.

### Trigger
Run when active OM advances the checkpoint and finalizes:
- new `checkpointSummary`
- removed reflection set
- removed reflected observation set

### Responsibilities
- create package directory
- write `README.md`
- write archived reflection files
- write supporting observation files
- write a package-level manifest if needed

### Invariants
- package creation must be idempotent
- package contents are immutable after success
- the writer must not depend on the memory agent to complete

## Package Metadata Tracking
The system needs a small state boundary to avoid reprocessing the same checkpoint package forever.

This can live in thread metadata, agent metadata, or a dedicated light table.

It should track at least:
- last written checkpoint package id
- last processed checkpoint package id by the memory agent
- timestamps for write/process
- failure breadcrumbs for the memory workflow

This is operational state, not memory content.

## Memory Agent Workspace Responsibilities

### `/memory`
Mutable, maintained knowledge documents.

Possible document families:
- `entities/`
- `patterns/`
- `playbooks/`
- `risks/`
- `domains/`
- `relationships/`
- `timelines/`

The exact taxonomy can remain flexible in the first implementation.
What matters is:
- documents are maintained over time
- documents are synthesized from checkpoint evidence
- documents are not the same thing as checkpoint packages

### Update behavior
The memory agent should:
- read unprocessed checkpoint packages
- decide which `/memory` docs need updates
- update those docs directly in the workspace
- record that the package was processed

It should be free to reorganize `/memory`, but not `/checkpoints`.

## Execution Model

### Not a processor
The memory workflow must not be an input/output processor in the main agent generate path.

### Trigger modes
The memory workflow should be able to run:
- when the agent becomes idle
- on a periodic schedule while the agent remains idle

### Runtime control
The memory workflow should still use:
- explicit generate timeout
- retry/backoff
- step accounting/logging
- the same style of observability already used in the agent runner

This keeps it operationally consistent without coupling it to the main prompt path.

## Suggested Lifecycle

### Stage 1: checkpoint advancement in OM
The active OM advances checkpoint and updates its own state.

### Stage 2: checkpoint package write
Deterministic writer creates a package in `workspace-memory/checkpoints`.

### Stage 3: memory workflow pickup
When idle or on schedule, the memory workflow scans for checkpoint packages newer than the last processed package.

### Stage 4: memory consolidation
The memory workflow:
- reads `README.md`
- reads archived reflections
- optionally reads supporting observations
- updates documents under `/memory`

### Stage 5: process marker update
The workflow records that this package has been processed.

## Retrieval Direction
Future retrieval should be layered:

1. active OM context
2. `/memory` synthesized documents
3. checkpoint package evidence

This means:
- `/memory` is the preferred long-term retrieval surface
- `/checkpoints` is the archival source of truth

## Observability Requirements
The implementation should log:
- checkpoint package creation start/complete/failure
- package id and checkpoint generation
- reflection and observation counts written
- memory workflow pickup start/complete/failure
- packages discovered
- packages processed
- files changed under `/memory`
- time spent per memory run

This needs to be easy to correlate by:
- `agentId`
- `threadId`
- `checkpoint package id`

## Failure Semantics

### Package writer failure
- checkpoint advancement already happened in OM
- package write failure should be explicit and retryable
- failure must not corrupt existing packages

### Memory workflow failure
- checkpoint package remains on disk
- workflow can retry later
- `/memory` should remain consistent
- partial writes should be avoided or clearly recoverable

The checkpoint package is the durable handoff boundary that makes retries safe.

## Why This Is Simpler Than The Old LTM
This design is simpler because:
- OM handles active context only
- LTM handles durable knowledge only
- checkpoint packages create a clear handoff artifact
- historical evidence is audit-friendly
- async execution removes LTM from the main critical path

That separation should make the system easier to reason about, easier to debug, and less likely to interfere with the main agent loop.
