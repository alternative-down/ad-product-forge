# Agent Memory Redesign

## Status
- Draft
- Branch: `feat/custom-observational-memory`
- Goal: define a replacement for the current Mastra Observational Memory and Long-Term Memory flow

## Why This Exists
The current Mastra-based OM/LTM flow does not behave like the desired active context-management system.

Observed problems:
- observations rarely or never become meaningfully active
- reflections rarely or never become meaningfully active
- the active context is still driven too much by recent raw messages
- consolidation is not reliable enough to trust as an operational mechanism
- old summarized context does not advance through a clear sliding checkpoint
- LTM handoff does not operate as a predictable downstream stage

Because of that, the current OM/LTM pair was disabled in runtime on `develop` and in this branch we are documenting a replacement design before implementation.

## Product Need
We need a memory system that actively manages the conversation context over time instead of only reacting to message count thresholds.

The desired behavior is:
- keep the active context window bounded
- preserve recent raw interaction for freshness
- summarize older conversation progressively instead of dropping it abruptly
- carry forward consolidated context through checkpoints
- move older consolidated material into a separate LTM pipeline only after it leaves the active context

This is not just "memory retrieval". It is active context shaping.

## Core Principles
- Context should be managed by checkpoints, not by a naive last-N-messages rule.
- Recent raw messages should remain visible for freshness and local coherence.
- Summaries should be built in stages:
  - raw messages -> observations
  - observations -> reflections
- Older reflections should leave the active context through checkpoint advancement.
- What leaves the active context should become LTM input.
- The system should aim to keep the total active context under a target token budget.

## Desired Runtime Model
The target active context is composed of four layers:

1. System and runtime instructions
2. Recent raw messages
3. Active observations
4. Active reflections

Outside that active context there is:
- archived reflections past the current checkpoint
- LTM processing input derived from those archived reflections

## Desired Sliding Context Model
The desired context is a sliding window with structured compression.

High-level flow:
1. Start from a checkpoint.
2. Accumulate raw messages after that checkpoint.
3. When a raw batch reaches a threshold, generate an observation for that batch.
4. Replace that raw batch in the active context with the observation.
5. Keep accumulating observations.
6. When an observation batch reaches a threshold, generate a reflection.
7. Replace those observations in the active context with the reflection.
8. Keep accumulating reflections.
9. When active context pressure exceeds the target budget, move the checkpoint forward.
10. Reflections that fall behind the new checkpoint leave active context and become LTM input.

This makes the context progressive instead of flat.

## Checkpoint Semantics
The checkpoint is the anchor for active context reconstruction.

The checkpoint should represent:
- "everything before this point has already been consolidated enough for active context purposes"
- "everything after this point still participates in active context assembly"

The checkpoint should not be tied to:
- a fixed count of raw messages
- a fixed count of total thread messages

The checkpoint should move forward only when:
- newer consolidated context is strong enough to replace older active material
- the active context would otherwise exceed the target token budget

## Desired Active Context Assembly
When preparing a model call, the system should assemble context approximately like this:

1. base system/runtime instructions
2. `AGENT_CONTEXT.md`
3. recent raw messages kept intentionally fresh
4. active observations after the checkpoint
5. active reflections after the checkpoint
6. current flush input and current-step prompt

The active context builder should prefer token budgeting over message counting.

## Suggested Initial Targets
These are working targets, not final constants:

- total active context target: about `50,000` tokens
- recent raw message reserve: about `10-15` messages or a token-based equivalent
- raw -> observation batch threshold: about `5,000` tokens
- observation -> reflection batch threshold: about `5,000` tokens

These thresholds should eventually be configurable, but the first implementation can hardcode them if that helps simplify iteration.

## Desired LTM Relationship
LTM should not observe the full live thread directly.

Instead:
- LTM should receive material only after it leaves the active context
- the preferred handoff unit is archived reflections, not raw thread text
- this makes LTM downstream from active context management

That means LTM becomes:
- slower
- more stable
- more durable
- less entangled with the live step loop

## Why The Current Mastra Model Is A Bad Fit
The current Mastra memory processors are too opinionated for this design.

Main friction points:
- they center around their own processor lifecycle
- they decide too much implicitly
- they are not naturally checkpoint-driven
- they do not expose the exact active-context replacement flow we want
- they make it hard to treat observations and reflections as first-class runtime artifacts
- they make LTM coupling feel indirect and reactive instead of explicit

This does not automatically mean Mastra must be removed entirely, but it does mean the current OM/LTM processor path is likely the wrong abstraction layer.

## Open Architecture Question
There are two plausible directions:

### Option A: Keep Mastra for the agent, replace only OM/LTM
- keep agent execution on Mastra
- build our own context manager outside Mastra OM
- inject assembled context ourselves
- maintain our own checkpoint, observation, reflection, and archive state

### Option B: Move to AI SDK for the full execution loop
- remove Mastra from the main run loop
- own the full step lifecycle directly
- own message history, checkpointing, summarization, and LTM pipeline directly

Option A is lower migration cost.
Option B is cleaner if Mastra continues to resist the desired execution model.

## Recommended Next Investigation
Before implementation, define the data model of the new active context manager.

At minimum we need explicit persisted entities for:
- checkpoint
- raw batch
- observation
- reflection
- archived reflection
- LTM handoff state

We also need to specify:
- how active context is rebuilt for a step
- when summarization jobs are triggered
- whether summarization runs inline with the agent step or in a side pipeline
- how token accounting is estimated for each layer

## Proposed Implementation Order
1. Define the persistence model for checkpoint, observations, reflections, and archives.
2. Define the active context assembly algorithm.
3. Define the raw-to-observation batching rule.
4. Define the observation-to-reflection batching rule.
5. Define checkpoint advancement.
6. Define archived reflection handoff to LTM.
7. Only then decide whether this stays on Mastra runtime or moves to AI SDK.

## Non-Goals For The First Iteration
- semantic retrieval over the full live thread
- rich graph memory
- generalized autonomous summarization for every artifact type
- backward compatibility with the current Mastra OM record model

The first goal is narrower:
- build a reliable active context compressor with checkpoints

