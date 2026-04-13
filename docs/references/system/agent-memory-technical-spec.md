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
- reuses Mastra OM structures directly
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
- the OM storage table and history model
- the OM markers/event shape
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
- the existing OM storage table and history rows
- the existing OM storage methods and record lifecycle shape
- the existing OM marker family for observation/reflection visibility
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
The persistence model must stay on Mastra's OM surface.

That means:
- use the existing OM table
- use the existing `ObservationalMemoryRecord` type
- use the existing OM history chain
- use the existing OM markers
- do not introduce a second custom OM table family for blocks/artifacts/handoff

The implementation is allowed to add custom control state, but that control state should live on top of the Mastra OM base, not beside it as a parallel persistence model.

### 1. Canonical OM record
The canonical persisted OM state remains the current thread-scoped `ObservationalMemoryRecord`.

Its existing fields should keep their normal roles:
- `id`
- `threadId`
- `resourceId`
- `createdAt`
- `updatedAt`
- `lastObservedAt`
- `originType`
- `generationCount`
- `activeObservations`
- `observationTokenCount`
- `config`
- `metadata`

In the new system:
- `activeObservations` remains the persisted active observation layer
- `generationCount` remains the version counter
- `lastObservedAt` remains the main cursor
- reflection generations continue using the existing OM history model

### 2. Reflection history
Active and previous reflections should be represented through the existing OM generation history rather than a new reflection table.

That means:
- reflection output becomes a new OM generation
- `originType = 'reflection'` remains the semantic marker for reflected generations
- active reflections are reconstructed from the relevant OM history window after the current checkpoint

This is the key point where the design must stay 1:1 with the Mastra OM base instead of creating a second artifact model.

### 3. Thread-local checkpoint and block control state
Checkpoint position and block-progress control state should live in `thread.metadata.mastra.om`, not in a parallel OM table family.

That thread-local control state should include:
- checkpoint cursor breadcrumbs
- checkpoint reflection generation reference
- raw block open/closed state
- observation block open/closed state
- recent raw token count
- active reflection token count
- last success/failure breadcrumbs needed for debugging

This keeps the actual persisted OM surface the same while letting us control lifecycle differently.

### 4. Markers
Observation/reflection lifecycle visibility should continue to use the Mastra OM marker family.

The processor can emit the same kinds of:
- observation start/end/failure markers
- reflection start/end/failure markers

What changes is the lifecycle that decides when those markers are emitted, not the marker surface itself.

## Store Layer
The processor should not talk to raw tables everywhere.
It should go through one store boundary:
- `CheckpointedContextStore`

That store should own these operations:
- get or create OM record through the existing OM storage surface
- get OM history through the existing OM storage surface
- load thread messages after checkpoint
- load thread checkpoint/block control state from thread metadata
- write thread checkpoint/block control state to thread metadata
- update active observations on the current OM record
- create the next reflection generation on the OM history chain
- list active reflections after checkpoint
- list active observations after checkpoint
- list recent raw messages after checkpoint
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
- OM history relevant to the current checkpoint
- thread metadata mirror
- raw messages after checkpoint
- open raw block control state
- open observation block control state
- active observations after checkpoint
- active reflections after checkpoint

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
- immediately generate the observation text
- on success:
  - append it into `activeObservations` on the current OM record
  - update OM token counts on the current record
  - advance `lastObservedAt`
  - append that observation into the observation block control stream
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
- immediately generate the reflection text
- on success:
  - create a new OM reflection generation using the existing OM history model
  - reset the active observation layer on the new current generation to the post-reflection state
  - increment `generationCount`
- on failure:
  - persist failure state
  - abort the step
  - do not retry automatically

### Stage 5: Advance checkpoint when reflection budget is exceeded
Compute the active reflection budget as:
- `totalActiveBudget - recentRawReserve - rawBatchThreshold - observationBatchThreshold`

If active reflections exceed that derived budget:
- select the oldest checkpoint-advance block
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
- same broad marker/event shape

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
- one observation text payload that is persisted through the current OM record's `activeObservations`

### Reflection generation input
Required input:
- one closed observation block

Optional support context:
- older observation or reflection blocks within a configurable token budget

Output:
- one reflection text payload that is persisted as the next OM reflection generation

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

## LTM Boundary
LTM is a separate processor concern.

The active-context manager should not create its own archived/handoff state model.

The only contract it must preserve is:
- anything behind the latest checkpoint is no longer part of active context
- the OM surface remains the same Mastra OM surface

That keeps the existing downstream LTM integration path conceptually intact and avoids coupling LTM state to the new OM manager.

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
- relevant OM history generations
- checkpoint pointer
- `lastObservedAt`
- `generationCount`
- active recent raw token count
- open raw block control state
- open observation block control state
- active reflection token count
- last successful observation generation timestamp
- last successful reflection generation timestamp
- last checkpoint advancement timestamp
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

1. confirm the persistence baseline:
   - reuse the existing OM table/history surface as-is
   - store checkpoint/block control state only in thread metadata unless a real gap forces a later schema addition
2. implement `CheckpointedContextStore` on top of the existing OM storage surface
3. implement the pure lifecycle logic for:
   - raw reserve slicing
   - raw block ownership
   - observation block ownership
   - checkpoint advancement
   - active-context reconstruction inputs
4. implement observation/reflection generators using the current Mastra OM prompting style and marker shape
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
