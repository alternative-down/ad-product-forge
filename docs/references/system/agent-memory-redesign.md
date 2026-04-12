# Agent Memory Redesign

## Status
- Draft
- Branch: `feat/custom-observational-memory`
- Purpose: describe the desired memory behavior before implementation

## Objective
The system needs an active context-management layer that continuously compresses older thread material without losing operational continuity.

This layer must:
- keep the live context bounded
- keep recent raw interaction visible
- progressively consolidate older material
- carry forward useful context through structured summaries
- hand off material that is no longer active to LTM

The main goal is not retrieval. The main goal is controlled context compression.

## What The New Memory Must Do
The desired behavior is:
- keep some recent raw messages fresh in context
- accumulate older raw messages into bounded batches
- turn those batches into observations
- accumulate observations into bounded batches
- turn those observation batches into reflections
- keep recent reflections active while older reflections move behind a checkpoint
- send reflections that leave the active window to LTM

This should create a sliding context with multiple compression layers instead of a flat "last N messages" view.

## Target Mental Model
At any point, the active context should be thought of as:

1. system and runtime instructions
2. `AGENT_CONTEXT.md`
3. recent raw messages
4. active observations
5. active reflections
6. current wake/flush input

Everything older than the active checkpoint should no longer compete for live context unless intentionally reintroduced by another mechanism.

## Desired Sliding Context Behavior
The active context should move forward continuously.

It should work like this:

1. New raw messages arrive after the current checkpoint.
2. Recent raw messages remain visible as-is for freshness.
3. Older raw messages after the checkpoint accumulate into a bounded raw batch.
4. When that raw batch reaches its threshold, an observation is generated.
5. That observation replaces those raw messages in the active context.
6. Observations continue to accumulate after the checkpoint.
7. When an observation batch reaches its threshold, a reflection is generated.
8. That reflection replaces those observations in the active context.
9. Reflections continue to accumulate while the total active context stays within budget.
10. When the total active context would exceed the target budget, the checkpoint moves forward.
11. Reflections that fall behind the new checkpoint leave the active context.
12. Those reflections become the material that LTM should later process.

This means:
- raw messages compress into observations
- observations compress into reflections
- old reflections age out through checkpoint advancement

## Checkpoint Semantics
The checkpoint is the boundary between:
- what still belongs to live active context
- what has already been consolidated enough to leave that live context

The checkpoint should represent a semantic boundary in the compression pipeline, not a message-count boundary.

In practice, that means:
- the checkpoint must not be "last 20 messages"
- the checkpoint must not be "everything older than N messages"
- the checkpoint should advance only when enough newer consolidated context exists to replace older active material safely

Another way to state it:
- the checkpoint marks the oldest point from which active context still needs to be reconstructed

## Recent RAW Message Layer
The system should intentionally preserve a small recent raw layer.

Why:
- the latest interaction often depends on exact wording
- the agent needs some immediate conversational continuity
- very recent details should not be compressed too early

Desired behavior:
- keep about `10-15` recent raw messages, or a token-based equivalent
- keep them as raw messages, not observations
- they should be the freshest part of the active context

This raw reserve should be protected as long as possible when the context budget is assembled.

## Observation Layer
Observations are the first compression stage over raw messages.

An observation should:
- summarize a bounded batch of older raw messages
- preserve the important facts, actions, decisions, and local implications of that batch
- replace those raw messages inside the active context

Observations should be:
- more compact than the raw batch
- still close to the concrete events
- specific enough to preserve operational detail

The intent is not to produce a timeless summary yet. The intent is to compact a recent region of raw conversation while keeping local usefulness.

## Reflection Layer
Reflections are the second compression stage over observations.

A reflection should:
- synthesize a bounded batch of observations
- extract the more durable or cross-cutting meaning from them
- replace those observations inside the active context

Reflections should be:
- more compact than a stack of observations
- more abstract and durable
- less tied to one local conversation moment

Reflections are what should carry medium-term continuity inside the active context.

## LTM Handoff
LTM should not work from the full live thread.

Instead, LTM should receive only material that has already left the active context.

The preferred handoff unit is:
- reflections that moved behind the latest checkpoint

That means LTM is downstream from the active compression system.

Why this is desirable:
- LTM receives already-consolidated material
- LTM is less coupled to live thread noise
- active context remains the primary operational layer
- LTM becomes a later-stage memory layer instead of trying to manage live continuity directly

## Desired Token Strategy
The active context should be managed primarily by token budget, not by message count.

The current target idea is:
- total active context target: about `50,000` tokens
- raw reserve: about `10-15` recent raw messages, or token equivalent
- raw-to-observation batch threshold: about `5,000` tokens
- observation-to-reflection batch threshold: about `5,000` tokens

These values are not final, but they express the intended shape:
- keep the whole active context modest
- compress in bounded chunks
- preserve some fresh raw detail

## Context Assembly Expectations
When a model call is prepared, active context assembly should behave roughly like this:

1. include base runtime/system instructions
2. include `AGENT_CONTEXT.md`
3. include the recent raw message reserve
4. include active observations after the checkpoint
5. include active reflections after the checkpoint
6. include the current flush input or current-step prompt
7. enforce the total target token budget

The assembly process should prefer:
- keeping the recent raw reserve
- then keeping the newest useful reflections
- then keeping the newest useful observations

Anything older should be compressed or pushed behind the checkpoint instead of being allowed to sprawl.

## What "Replace" Means
In this design, replacement is important.

When:
- raw messages become an observation
- or observations become a reflection

the older material should stop competing for live context in the same layer.

That does not mean the system must delete all historical records.
It means the active context builder should treat the newer artifact as the live representation of that older region.

Without replacement, context only grows.
With replacement, context slides.

## Why This Is Different From Naive Summarization
This is not just:
- summarize sometimes
- keep a summary around

It is a structured pipeline with:
- checkpoints
- bounded raw reserve
- bounded observation batches
- bounded reflection batches
- explicit active-context replacement
- explicit handoff to LTM when material ages out

The design is closer to a rolling compression system than to a one-off memory summary.

## Important Behavioral Requirements
The future implementation must satisfy these requirements:

- It must be possible to tell what the current active checkpoint is.
- It must be possible to tell which raw messages are still active as raw.
- It must be possible to tell which observations are currently active.
- It must be possible to tell which reflections are currently active.
- It must be possible to tell what has already left the active context.
- It must be possible to tell what is waiting for LTM handoff.

The behavior must be inspectable and predictable.

## Open Questions
These still need definition:

- What exact rule decides when a raw batch is closed?
- What exact rule decides when an observation batch is closed?
- Should batching be token-only, message-only, or hybrid?
- How many reflections should remain active before checkpoint advancement?
- Should checkpoint advancement happen inline during a run or in a side process?
- What exact shape should a reflection have so that it is good active context and also good future LTM input?
- Should there be one global checkpoint per thread, or separate checkpoints per layer?

## What This Document Is Trying To Lock In
This document is trying to lock in the desired behavior, not the implementation mechanism.

The essential behavior to preserve is:
- recent raw context stays visible
- older context compresses progressively
- the active window slides forward
- older reflections leave active context
- those aged-out reflections become LTM input

If the implementation eventually differs internally but preserves that behavior, it is still acceptable.

