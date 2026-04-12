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
3. active reflections
4. active observations
5. recent raw messages
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
- checkpoint advancement should happen in reflection blocks, not one reflection at a time
- a checkpoint-advance block can be defined as a percentage of the reflection history budget
- an example shape is roughly `50%` of that reflection budget
- checkpoint advancement should trigger as soon as the active reflection area exceeds its budget
- this should happen during step-time context management, not at run boundaries
- this mechanism must be independent from the runner's run lifecycle

Another way to state it:
- the checkpoint marks the oldest point from which active context still needs to be reconstructed
- there must be one primary checkpoint per thread for active-context reconstruction
- auxiliary internal checkpoints can exist if they help manage batch buffers, but they are optional implementation details and not the main semantic boundary

## Recent RAW Message Layer
The system should intentionally preserve a small recent raw layer.

Why:
- the latest interaction often depends on exact wording
- the agent needs some immediate conversational continuity
- very recent details should not be compressed too early

Desired behavior:
- keep about `10,000` tokens of recent raw messages
- keep them as raw messages, not observations
- they should be the freshest part of the active context

This raw reserve should be protected as long as possible when the context budget is assembled.
Raw messages inside this reserve should not be compressed yet.

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

Rule:
- once a raw batch becomes an observation, that raw batch should leave the active context completely
- the observation becomes the only active representation of that older raw region
- the raw batch should be closed by token threshold only, not by message count
- the raw batch should start only after the recent raw reserve has already been filled
- that means raw material first occupies the `10,000` token recent reserve, and only older overflow starts filling the `5,000` token observation batch buffer
- the raw block should first be explicitly closed, and then the observation should be generated from that closed block
- the first implementation can do this synchronously right after block closure, while preserving the option to make this asynchronous later

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

Rule:
- once an observation batch becomes a reflection, those observations should leave the active context completely
- the reflection becomes the only active representation of that older observation region
- the observation batch should be closed by token threshold only, not by message count
- the observation batch buffer should target about `5,000` tokens before generating a reflection
- the textual shape and prompting style of observations and reflections can initially follow the same model already used by the current OM implementation
- the observation block should first be explicitly closed, and then the reflection should be generated from that closed block
- the first implementation can do this synchronously right after block closure, while preserving the option to make this asynchronous later

## LTM Handoff
LTM should not work from the full live thread.

Instead, LTM should receive only material that has already left the active context.

The preferred handoff unit is:
- reflections that moved behind the latest checkpoint

That means LTM is downstream from the active compression system.
The handoff flow can initially follow the same general downstream model already used today by the current LTM integration.

Why this is desirable:
- LTM receives already-consolidated material
- LTM is less coupled to live thread noise
- active context remains the primary operational layer
- LTM becomes a later-stage memory layer instead of trying to manage live continuity directly

## Desired Token Strategy
The active context should be managed primarily by token budget, not by message count.
Token accounting can initially follow the same counting approach currently used by the existing OM implementation.
The active context budget described in this document applies to the reconstructed active memory layers before the current flush input is added.
The current flush input should be treated as additional prompt material that enters afterward, as it does today.
This budget also excludes the base system/runtime instructions and `AGENT_CONTEXT.md`.
In practice, the OM-managed budget applies only to the message-derived active context reconstructed from the checkpoint forward.
Anything loaded into that reconstructed checkpoint-derived context should count toward the budget.

The current target idea is:
- total active context target: about `50,000` tokens
- recent raw reserve: about `10,000` tokens
- raw-to-observation batch buffer: about `5,000` tokens
- observation-to-reflection batch buffer: about `5,000` tokens
- active reflection history budget: whatever remains from the total target after the three reserved areas above

These values are not final, but they express the intended shape:
- preserve a fixed recent raw reserve
- compress older material in bounded chunks
- keep most of the active historical continuity in reflections

This also clarifies the active layout:
- newest `10k` tokens stay as raw recent context
- raw material older than that does not stay raw in active context
- once raw material accumulates another `5k` tokens beyond the recent reserve, it should become an observation
- once observations accumulate `5k` tokens, they should become a reflection
- reflections occupy the remaining active historical budget

Examples:
- if the total target is `50k`, the reflection history budget is about `30k`
- if the total target is `100k`, the reflection history budget is about `80k`

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
- then keeping the active reflection history
- then keeping the newest active observations that have not yet been reflected

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

## What This Document Is Trying To Lock In
This document is trying to lock in the desired behavior, not the implementation mechanism.

The essential behavior to preserve is:
- recent raw context stays visible
- older context compresses progressively
- the active window slides forward
- older reflections leave active context
- those aged-out reflections become LTM input

If the implementation eventually differs internally but preserves that behavior, it is still acceptable.
