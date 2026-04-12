# Agent Memory Technical Spec

## Status
- Draft
- Branch: `feat/custom-observational-memory`
- Scope: technical specification for the first implementation of the new checkpoint-based active context manager

## Inputs
This spec is derived from:
- [agent-memory-redesign.md](/home/nicolas/Documentos/github/ad-product-forge/docs/references/system/agent-memory-redesign.md)
- the current Forge runner/runtime
- the currently installed Mastra runtime and processor APIs

## Technical Goal
Implement the new active context manager while keeping the current agent runtime usable.

The first version should:
- disable the current Mastra OM/LTM processors
- keep Mastra agent execution, working memory, workspace, and tools
- add our own checkpoint-based context manager
- run that manager at step time before the final agent `generate`
- keep the implementation inspectable and deterministic

## Investigation Findings About Mastra

### What Mastra gives us
The installed Mastra runtime already gives us the processor hooks we need:

- `processInputStep`
  - runs before each step
  - can inspect and mutate the `MessageList`
- `processOutputStep`
  - runs after each step
  - can inspect step output and persist derived state
- `abort()` / TripWire
  - can stop a step from inside a processor
  - can optionally retry, but we do not want retry for this first version
- `MessageList`
  - can remove messages by id
  - can add tagged system messages
  - can replace tagged system messages

These capabilities are enough to build our own active context management layer without depending on Mastra's built-in OM behavior.

### What Mastra does not give us directly
Mastra's built-in message history loading is still based on memory/thread loading rules such as `lastMessages`.

It does not natively support:
- checkpoint-based thread reconstruction
- replacing older thread regions with our own observation/reflection artifacts
- sliding checkpoint semantics
- our explicit block lifecycle

So the custom implementation must own:
- checkpoint state
- block state
- artifact generation state
- active-context reconstruction logic

## First-Version Integration Strategy

### Chosen direction
The first version should keep Mastra for:
- the agent loop
- tools
- workspace
- working memory
- persistence of the actual thread

But it should replace OM/LTM behavior with a custom processor pipeline.

### Why this is the right first step
This keeps the blast radius lower:
- we do not need to rewrite the whole agent runtime immediately
- we can attach to `processInputStep` and `processOutputStep`
- we can validate the new context model before deciding whether Mastra itself must later be removed from the main loop

### Key design implication
The new memory system is not "another summary processor".
It is a thread-aware active context manager that happens to use processor hooks as the execution surface.

## High-Level Runtime Shape

### Before the agent step
On every step, a custom input processor should:

1. load the current checkpoint + memory state for the thread
2. inspect newly persisted thread messages after the checkpoint
3. update open raw / observation / reflection blocks
4. if thresholds are crossed:
   - close block
   - synchronously generate observation or reflection
   - persist the resulting artifact
   - continue cascading while more transitions are needed
5. if reflection budget is exceeded:
   - advance checkpoint by reflection block
   - mark those reflections as archived / LTM-pending
6. rebuild the active context
7. mutate the `MessageList` so the final model call sees:
   - base system prompt
   - `AGENT_CONTEXT.md`
   - active reflections
   - active observations
   - recent raw messages
   - current flush input

### After the agent step
The first version should keep post-step behavior minimal.

`processOutputStep` should be used only for bookkeeping that depends on the finished step if needed, not for the main compression pipeline.

The main compression pipeline should happen before the main step `generate`, because:
- the user defined this as step-time context management
- context must already be correct when the actual agent model runs

## Recommended Processor Structure

### Processor 1: `CheckpointedContextProcessor`
Main processor responsible for active context management.

Responsibilities:
- load thread state from our custom OM store
- inspect the thread slice after the primary checkpoint
- create/close/update raw blocks
- create observations
- create reflections
- advance checkpoint
- prepare LTM handoff state
- rebuild the active context inside `MessageList`

Primary method:
- `processInputStep`

Optional secondary method:
- `processOutputStep`
  - only if some bookkeeping must happen after the step's response is known

### Processor 2: `CheckpointedLtmHandoffProcessor` (optional in first version)
If needed, LTM handoff can remain a separate processor or service.

Responsibilities:
- look for archived reflections pending LTM handoff
- hand them to the downstream LTM flow
- mark handoff status

This can be built later if we want to keep the first version smaller.

## First-Version Persistence Model
This is the first draft of the persisted entities.

### 1. Thread checkpoint
One primary checkpoint per thread.

Suggested fields:
- `thread_id`
- `resource_id`
- `checkpoint_message_id`
- `checkpoint_created_at`
- `latest_archived_reflection_id`
- `updated_at`

Purpose:
- identify where active-context reconstruction starts

### 2. Raw block
Represents a strict batch of raw thread messages.

Suggested fields:
- `raw_block_id`
- `thread_id`
- `resource_id`
- `start_message_id`
- `end_message_id`
- `token_count`
- `status`
  - `open`
  - `closed`
  - `observed`
- `created_at`
- `updated_at`

Invariants:
- a raw message belongs to one raw block only
- closed does not mean observed

### 3. Observation artifact
Represents one immutable observation created from one closed raw block.

Suggested fields:
- `observation_id`
- `thread_id`
- `resource_id`
- `raw_block_id`
- `content`
- `token_count`
- `created_at`

Invariants:
- immutable after creation
- one raw block maps to at most one observation artifact

### 4. Observation block
Represents a strict batch of observations to be reflected.

Suggested fields:
- `observation_block_id`
- `thread_id`
- `resource_id`
- `start_observation_id`
- `end_observation_id`
- `token_count`
- `status`
  - `open`
  - `closed`
  - `reflected`
- `created_at`
- `updated_at`

Invariants:
- one observation belongs to one observation block only
- closed does not mean reflected

### 5. Reflection artifact
Represents one immutable reflection created from one closed observation block.

Suggested fields:
- `reflection_id`
- `thread_id`
- `resource_id`
- `observation_block_id`
- `content`
- `token_count`
- `created_at`

Invariants:
- immutable after creation
- one observation block maps to at most one reflection artifact

### 6. Archived reflection / LTM handoff state
Represents reflections that moved behind the checkpoint.

Suggested fields:
- `reflection_id`
- `thread_id`
- `resource_id`
- `archived_at`
- `ltm_status`
  - `pending`
  - `processing`
  - `done`
  - `failed`
- `ltm_attempted_at`
- `ltm_completed_at`

Purpose:
- preserve deterministic handoff state
- support later async LTM work

## Why Separate Block Tables And Artifact Tables
We need to separate:
- source grouping
- generated artifact

because the user explicitly defined:
- a closed block is not yet the resulting summary
- failure after closing must stop execution
- block ownership is strict
- artifacts are immutable

That means one table/object is not enough.

## Step-Time Lifecycle

### A. Load current checkpoint state
At the start of `processInputStep`:
- load primary checkpoint
- load open raw block if any
- load open observation block if any
- load active observations after checkpoint
- load active reflections after checkpoint

### B. Build raw candidate set
Read the thread messages after the checkpoint.

Then:
- preserve the newest raw reserve according to configured token budget
- route older overflow into the current raw block

### C. Close raw block when threshold is hit
When raw overflow reaches the configured threshold:
- close the raw block
- synchronously generate an observation from that closed block
- if generation fails:
  - abort step
  - do not retry automatically
- if generation succeeds:
  - persist immutable observation
  - mark raw block as `observed`

### D. Close observation block when threshold is hit
When open observations reach the configured threshold:
- close the observation block
- synchronously generate a reflection from that closed block
- if generation fails:
  - abort step
  - do not retry automatically
- if generation succeeds:
  - persist immutable reflection
  - mark observation block as `reflected`

### E. Advance checkpoint if reflection budget is exceeded
When active reflection history exceeds its derived budget:
- advance checkpoint by reflection block
- archive the reflections that moved behind the new checkpoint
- mark them `ltm_status = pending`

### F. Cascade until stable
The user explicitly wants all eligible transitions to happen in one management execution.

So the processor should continue looping until:
- no raw block needs closure
- no observation block needs closure
- no checkpoint move is needed

### G. Rebuild active context in `MessageList`
After state is stable, the processor should rebuild the active context for the upcoming model call.

## How To Rebuild Context In Mastra

### Important constraint
Mastra still loads thread history through its own memory/history path.
That means our processor must treat the incoming `MessageList` as raw material to be reshaped.

### First-version strategy
Use `processInputStep` to:

1. identify which remembered/input messages are older than the checkpoint-derived active view
2. remove those messages from the `MessageList`
3. add active reflections as tagged system messages
4. add active observations as tagged system messages
5. leave recent raw messages in chronological order

This gives the final prompt the desired layer order without depending on built-in OM.

### Why system messages for reflections and observations
This is the simplest way to force stable ordering:
- base system prompt
- `AGENT_CONTEXT.md`
- reflections
- observations
- raw recent messages

Mastra already supports tagged system messages and replacing them cleanly.

### Important note
The memory budget defined in the functional spec excludes:
- base system/runtime instructions
- `AGENT_CONTEXT.md`
- current flush input

So the custom active-context builder only budgets:
- checkpoint-derived reflections
- checkpoint-derived observations
- checkpoint-derived recent raw messages

## Supporting Context For Summary Generation
When generating a new observation or reflection:
- the block ownership stays strict
- but older blocks may be loaded as supporting context

Selection rule:
- choose supporting older blocks within a configurable token limit
- do not use unconstrained block counts

This applies to:
- observation generation
- reflection generation

## Failure Semantics

### Summary generation failure
If observation or reflection generation fails after the source block has already been closed:
- abort the step
- do not retry automatically
- leave the closed block persisted as closed-but-not-summarized

This is compatible with Mastra:
- `processInputStep` can abort the step through TripWire
- we should set retry to `false`

### Why not retry automatically
The user explicitly does not want retry in this first synchronous version.
The context window is not allowed to expand to compensate.

## Recommended Use Of TripWire
For the first version:
- use processor abort/tripwire to stop the step when a required summary generation fails
- do not use processor retry

Reason:
- it matches the functional spec
- it fits Mastra's processor model cleanly
- it avoids silent continuation with invalid context state

## Runner Impact
The current runner can remain mostly intact.

But these changes are recommended:

### 1. Stop treating `lastMessages` as the main long-horizon continuity mechanism
The new OM becomes the main long-horizon continuity layer.

`lastMessages` still matters for:
- recent raw thread visibility
- step continuity

But it should no longer be the main substitute for checkpointed context management.

### 2. Keep working memory independent
Working memory remains separate.
This redesign is about active context compression, not about working memory semantics.

### 3. Keep current flush behavior
The flush remains outside the OM-managed budget and should still enter as current-step prompt material.

## Draft Configuration Surface
The first version should expose configurable parameters for:
- total active context target
- recent raw reserve tokens
- raw block closure threshold
- observation block closure threshold
- reflection history budget strategy
  - fixed derived remainder from total target
- checkpoint advancement block percentage
- supporting-context token limit for observation generation
- supporting-context token limit for reflection generation

These should be global settings first, not per-agent settings.

## Observability Requirements
The new system must be inspectable.

At minimum we need:
- current checkpoint per thread
- active raw reserve token count
- open raw block token count
- open observation block token count
- active reflection token count
- archived reflections pending LTM
- last successful observation generation
- last successful reflection generation
- last checkpoint advancement
- last failure reason if a summary generation aborted a step

This should be visible in logs and later in admin UI.

## First-Version Recommendation
Implement in this order:

1. create persistence schema for checkpoint, blocks, artifacts, and LTM handoff
2. build a `CheckpointedContextStore`
3. build the pure domain logic that:
   - groups raw messages
   - closes blocks
   - decides when to generate summaries
   - decides when to advance checkpoint
4. build generators for:
   - observation from closed raw block
   - reflection from closed observation block
5. build `CheckpointedContextProcessor.processInputStep`
6. integrate it into the current Forge runtime with OM/LTM disabled
7. add logs/admin inspection

## Known Risks
- first version may still rely on Mastra loading more thread history than we ultimately want
- using tagged system messages for active reflections/observations is operationally simple, but we need to validate that prompt behavior stays good
- if thread history grows very large, later optimization may require bypassing Mastra's default history loading and reconstructing the step context more directly

## Conclusion
The new design can be implemented on top of Mastra's current processor hooks.

The key shift is:
- stop treating OM as a black-box summarizer
- treat it as an explicit checkpointed context-management subsystem

That is feasible with the current Mastra runtime, but only if we own:
- persistence
- lifecycle
- reconstruction
- failure semantics

