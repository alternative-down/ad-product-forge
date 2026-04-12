# Agent Memory Technical Spec

## Status
- Working Spec
- Branch: `feat/custom-observational-memory`
- Scope: technical specification for the replacement of the current OM behavior with a checkpoint-based active-context manager

## Inputs
This spec is derived from:
- [agent-memory-redesign.md](/home/nicolas/Documentos/github/ad-product-forge/docs/references/system/agent-memory-redesign.md)
- the current Forge runner/runtime
- the currently installed Mastra runtime, processor APIs, storage types, and OM structures

## Technical Goal
Implement a new active-context manager that:
- preserves the current Forge agent runtime
- reuses Mastra structures where they are useful
- replaces Mastra's current OM behavior
- keeps LTM handoff compatible with the current downstream pattern
- manages context by checkpoint and block lifecycle instead of by naive message windows

This spec is about the active context manager itself.
LTM handoff is downstream from that manager, not the main design problem.

## Fixed Product Decisions
The implementation must follow these already-set behavioral rules:

- active context order is:
  - system/runtime instructions
  - `AGENT_CONTEXT.md`
  - active reflections
  - active observations
  - recent raw messages
  - current flush input
- recent raw uses a reserved token budget
- older raw overflow fills a raw batch buffer
- raw batch closure is triggered only by token threshold
- raw batch replacement is strict:
  - once summarized, those raw messages leave active context completely
- observation batch closure is triggered only by token threshold
- observation batch replacement is strict:
  - once reflected, those observations leave active context completely
- observations and reflections are immutable artifacts
- blocks have strict ownership
- the primary checkpoint is per thread
- checkpoint advancement happens only on the reflection layer
- checkpoint advancement happens in blocks
- checkpoint advancement triggers as soon as active reflections exceed their budget
- closed block does not mean summarized
- first implementation is synchronous:
  - close block
  - generate artifact immediately
  - if generation fails, abort the step
  - no automatic retry
- if enough material exists, the manager can cascade through multiple transitions in one execution
- all thresholds and support-context limits are configurable

## Why Mastra Is Still The Right Execution Surface
The new behavior should reuse Mastra's execution surface rather than replace it here.

Mastra already gives us the parts we actually need:
- `processInputStep`
- `processOutputStep`
- `MessageList`
- storage and thread metadata
- processor abort / TripWire
- the current OM token-accounting basis
- the current observation/reflection prompting and text shape

What we are replacing is not the whole runtime.
We are replacing the memory behavior.

So the design should:
- keep Mastra's agent loop, tools, workspace, working memory, and thread persistence
- stop using Mastra's built-in OM lifecycle
- build our own checkpointed context manager as a processor-backed subsystem

## Mastra Structures We Intentionally Reuse
The new design should reuse these Mastra OM concepts directly:

- `ObservationalMemoryRecord` as the reference shape for the main per-thread active-memory record
- `lastObservedAt` as the main cursor concept
- `generationCount` as the state-version counter
- `thread.metadata.mastra.om` as the place for lightweight thread-local checkpoint metadata
- the current OM token-accounting basis
- the current OM observation/reflection prompting and text shape
- `MessageList` mutation methods and tagged system messages for active-context reconstruction

The new design should not reuse these behaviors:
- one monolithic `activeObservations` string as the whole active historical layer
- `bufferedReflection` activation semantics
- async/background OM lifecycle
- Mastra's current "observe everything after cursor, then condense into a single rolling text blob" behavior

## Final Integration Strategy
The implementation should be a custom processor-backed subsystem with one main processor:
- `CheckpointedContextProcessor`

The main pipeline runs in:
- `processInputStep`

That is where the manager must:
- load active-memory state
- inspect thread messages after checkpoint
- update raw / observation / reflection block state
- generate missing artifacts synchronously when thresholds are crossed
- advance checkpoint when reflection pressure requires it
- rebuild the active context into the `MessageList`

`processOutputStep` stays optional and minimal.
It may be used later for bookkeeping that genuinely depends on the finished response, but it is not the core of the design.

The core management cycle belongs before the main agent `generate`, because the context must already be correct when the model is called.

## Context Ownership Model
The new system owns only the checkpoint-derived active historical context.

It does not own:
- the base system/runtime instructions
- `AGENT_CONTEXT.md`
- the current flush input

Those are outside the OM-managed token budget.

The new system does own:
- active reflections
- active observations
- recent raw messages after checkpoint
- the block/artifact lifecycle that determines what remains active and what moves behind the checkpoint

## Persistence Model
The persistence model should be split into one thread-scoped active-memory record plus immutable block/artifact records.

This split is mandatory because:
- closed block is not summarized block
- artifacts are immutable
- ownership is strict
- failure after closure must still leave closed source state visible and correct

### 1. Thread Active Memory Record
One row per thread, modeled after the role Mastra's `ObservationalMemoryRecord` plays today.

Suggested fields:
- `id`
- `threadId`
- `resourceId`
- `createdAt`
- `updatedAt`
- `lastObservedAt`
- `generationCount`
- `checkpointMessageId`
- `checkpointMessageCreatedAt`
- `checkpointReflectionId`
- `recentRawTokenCount`
- `activeObservationTokenCount`
- `activeReflectionTokenCount`
- `lastSuccessfulObservationAt`
- `lastSuccessfulReflectionAt`
- `lastCheckpointAdvancedAt`
- `lastFailureAt`
- `lastFailureStage`
- `lastFailureReason`
- `configSnapshot`
- `metadata`

Purpose:
- hold the canonical thread-level active state
- define where reconstruction starts
- expose enough thread-level health/debug state without scanning blocks

### 2. Thread Metadata Mirror
Lightweight thread-local pointers should also be mirrored into `thread.metadata.mastra.om`.

Use it for:
- `lastObservedAt`
- checkpoint cursor breadcrumbs
- current generation count
- optional debug hints

This keeps the design aligned with Mastra's thread metadata pattern and makes thread inspection cheap.

### 3. Raw Block
Represents a strict batch of raw thread messages that moved beyond the recent raw reserve.

Suggested fields:
- `id`
- `threadId`
- `resourceId`
- `startMessageId`
- `endMessageId`
- `startCreatedAt`
- `endCreatedAt`
- `tokenCount`
- `status`
  - `open`
  - `closed`
  - `observed`
- `createdAt`
- `updatedAt`

Invariants:
- each raw message belongs to one raw block at most
- `closed` means source ownership is fixed
- `observed` means an immutable observation artifact was successfully produced for that block

### 4. Observation Artifact
Represents one immutable observation generated from one closed raw block.

Suggested fields:
- `id`
- `threadId`
- `resourceId`
- `rawBlockId`
- `content`
- `tokenCount`
- `supportContextTokenCount`
- `createdAt`

Invariants:
- immutable after creation
- one raw block maps to at most one observation artifact

### 5. Observation Block
Represents a strict batch of observation artifacts waiting to become one reflection.

Suggested fields:
- `id`
- `threadId`
- `resourceId`
- `startObservationId`
- `endObservationId`
- `tokenCount`
- `status`
  - `open`
  - `closed`
  - `reflected`
- `createdAt`
- `updatedAt`

Invariants:
- each observation belongs to one observation block at most
- `closed` means source ownership is fixed
- `reflected` means an immutable reflection artifact was successfully produced for that block

### 6. Reflection Artifact
Represents one immutable reflection generated from one closed observation block.

Suggested fields:
- `id`
- `threadId`
- `resourceId`
- `observationBlockId`
- `content`
- `tokenCount`
- `supportContextTokenCount`
- `createdAt`

Invariants:
- immutable after creation
- one observation block maps to at most one reflection artifact

### 7. Archived Reflection / LTM Handoff State
Represents reflection artifacts that have moved behind the checkpoint.

Suggested fields:
- `reflectionId`
- `threadId`
- `resourceId`
- `archivedAt`
- `ltmStatus`
  - `pending`
  - `processing`
  - `done`
  - `failed`
- `ltmAttemptedAt`
- `ltmCompletedAt`
- `ltmFailureReason`

Purpose:
- make checkpoint advancement deterministic
- make downstream LTM handoff inspectable
- keep LTM lifecycle separate from active-context reconstruction

## Store Layer
The processor should not talk to raw tables everywhere.
It should go through one store boundary:
- `CheckpointedContextStore`

That store should own these operations:
- get or create thread active-memory record
- load thread messages after checkpoint
- load open raw block
- load open observation block
- append raw messages to raw block
- close raw block
- create observation artifact
- mark raw block observed
- append observation to observation block
- close observation block
- create reflection artifact
- mark observation block reflected
- list active reflections after checkpoint
- list active observations after checkpoint
- list recent raw messages after checkpoint
- archive reflection block behind checkpoint
- advance checkpoint
- write thread metadata mirror
- write failure state
- write success timestamps and generation changes

This boundary is important because the processor logic should operate in terms of block and checkpoint semantics, not table details.

## Step-Time Algorithm
This algorithm runs in `processInputStep`.

### Stage 1: Load thread state
Load:
- thread active-memory record
- thread metadata mirror
- raw messages after checkpoint
- open raw block
- open observation block
- active observation artifacts after checkpoint
- active reflection artifacts after checkpoint

The checkpoint is the loading boundary.
There is no message-count-based reconstruction here.

### Stage 2: Recompute active slices after checkpoint
From messages after checkpoint:
- preserve the newest raw reserve by tokens
- route older raw overflow into the raw block stream

Important rule:
- messages are never truncated
- if one message crosses the reserve boundary, the excess older region moves to the batching path

### Stage 3: Update raw block state
Take the overflow raw region and:
- keep filling the open raw block if it exists
- otherwise open a new raw block

If the raw block token count reaches the configured threshold:
- close the raw block
- immediately generate the observation artifact
- on success:
  - persist observation artifact
  - mark raw block `observed`
  - append that observation into the observation block stream
- on failure:
  - persist failure state
  - abort the step
  - do not retry automatically

### Stage 4: Update observation block state
Take newly available observations and:
- keep filling the open observation block if it exists
- otherwise open a new observation block

If the observation block token count reaches the configured threshold:
- close the observation block
- immediately generate the reflection artifact
- on success:
  - persist reflection artifact
  - mark observation block `reflected`
- on failure:
  - persist failure state
  - abort the step
  - do not retry automatically

### Stage 5: Advance checkpoint when reflection budget is exceeded
Compute the active reflection budget as:
- `totalActiveBudget - recentRawReserve - rawBatchThreshold - observationBatchThreshold`

If active reflections exceed that derived budget:
- select the oldest checkpoint-advance block
- archive those reflection artifacts
- mark them `ltmStatus = pending`
- move the primary checkpoint forward to the end of that reflection block
- update the thread active-memory record
- update `thread.metadata.mastra.om`

Checkpoint advancement only operates on reflections.
It never operates directly on observations or raw messages.

### Stage 6: Cascade until stable
Keep looping while any of these remains true:
- raw block threshold is crossed
- observation block threshold is crossed
- reflection budget is exceeded

The processor must allow full cascade in one execution.
This is not one-transition-per-step logic.

### Stage 7: Rebuild the active context
Once the state is stable, rebuild the prompt-facing active context:
- active reflections
- active observations
- recent raw messages

Then mutate `MessageList` so the final model call sees:
- system/runtime instructions
- `AGENT_CONTEXT.md`
- reflections
- observations
- recent raw
- current flush input

## How Context Reconstruction Works In Mastra
Mastra still loads thread history through its memory/history path.
So the processor must treat the incoming `MessageList` as input to be reshaped.

The reconstruction flow should be:

1. identify remembered/input messages that are older than the checkpoint-derived active view
2. remove those messages from the `MessageList`
3. add active reflections as one tagged system section
4. add active observations as one tagged system section
5. leave the recent raw messages in chronological order

Recommended tags:
- `custom-om-reflections`
- `custom-om-observations`

This keeps ordering explicit and lets the processor replace those sections cleanly on every step.

## Summary Generation
Observation and reflection generation should reuse the existing Mastra OM style:
- same general prompting model
- same text shape
- same token-accounting basis

What changes is:
- source selection
- block semantics
- lifecycle
- checkpoint advancement

### Observation generation input
Required input:
- one closed raw block

Optional support context:
- older blocks within a configurable token budget

Output:
- one immutable observation artifact

### Reflection generation input
Required input:
- one closed observation block

Optional support context:
- older observation or reflection blocks within a configurable token budget

Output:
- one immutable reflection artifact

Support context does not change ownership.
It is read-only context for better synthesis.

## Failure Semantics
If a required observation or reflection generation fails after block closure:
- the closed block remains closed
- no artifact is created for that block
- step execution stops
- automatic retry is disabled

This should be implemented with processor abort / TripWire and `retry: false`.

This is the correct behavior for the synchronous first implementation because:
- the active context cannot be allowed to silently continue in an inconsistent state
- the design intentionally does not allow budget expansion as a fallback

## LTM Handoff
LTM handoff is triggered only by checkpoint advancement.

The handoff unit is:
- reflection artifacts that moved behind the checkpoint

The active context manager is responsible for:
- marking those reflections archived
- setting `ltmStatus = pending`

The downstream LTM path can then continue using the same broad pattern we already use today.
That remains a separate concern from active-context reconstruction.

## Configuration Surface
All thresholds must be configurable.

The global configuration surface should include:
- `activeContextTargetTokens`
- `recentRawReserveTokens`
- `rawBlockTokens`
- `observationBlockTokens`
- `checkpointAdvanceBlockPercent`
- `observationSupportContextTokens`
- `reflectionSupportContextTokens`

Derived value:
- `reflectionHistoryBudgetTokens = activeContextTargetTokens - recentRawReserveTokens - rawBlockTokens - observationBlockTokens`

These are global settings in the first implementation.
Per-agent overrides are out of scope here.

## Observability Requirements
The system must expose enough state to debug block and checkpoint behavior.

At minimum we need:
- thread active-memory record
- checkpoint pointer
- `lastObservedAt`
- `generationCount`
- active recent raw token count
- open raw block token count and status
- open observation block token count and status
- active reflection token count
- last successful observation generation timestamp
- last successful reflection generation timestamp
- last checkpoint advancement timestamp
- archived reflections pending LTM
- last failure stage and reason

These should be available through:
- logs
- admin inspection later
- thread metadata breadcrumbs

## Implementation Constraints
The first implementation is allowed to be operationally simple.

That means:
- Mastra may still load more raw thread history than the final optimized system will want
- the processor may prune and rebuild from that incoming `MessageList`
- artifact generation stays synchronous

What is not allowed:
- falling back to the current built-in OM semantics
- silently mixing checkpoint-managed layers with uncontrolled historical sprawl
- retrying failed summary generation automatically

## Implementation Order
The implementation should proceed in this order:

1. create the persistence schema for:
   - thread active-memory record
   - raw blocks
   - observation artifacts
   - observation blocks
   - reflection artifacts
   - archived reflection handoff state
2. implement `CheckpointedContextStore`
3. implement the pure lifecycle logic for:
   - raw reserve slicing
   - raw block ownership
   - observation block ownership
   - checkpoint advancement
   - active-context reconstruction inputs
4. implement observation/reflection generators using the current Mastra OM prompting style
5. implement `CheckpointedContextProcessor.processInputStep`
6. wire it into the Forge runtime with built-in OM/LTM disabled
7. add logs and admin inspection hooks

## Final Architectural Position
The design should be understood as:
- Mastra remains the runtime shell
- the new checkpointed context manager becomes the source of truth for active historical context

The key implementation stance is:
- reuse Mastra's structural primitives
- replace Mastra's current OM behavior
- keep the lifecycle explicit, deterministic, and inspectable

That gives us a design that stays aligned with the runtime we already have while removing the parts of OM behavior that do not match the desired system.
