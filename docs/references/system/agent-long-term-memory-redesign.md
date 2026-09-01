# Agent Long-Term Memory Redesign

## Status

- Working Spec
- Branch: `develop`
- Purpose: define the desired role, behavior, and boundaries of the new long-term memory system

## Objective

The system needs a long-term memory layer that is downstream from active context management.

Its purpose is not to help with immediate step-time context shaping.
Its purpose is to:

- preserve durable historical material
- consolidate recurring patterns and durable knowledge
- maintain living memory documents over time
- support future retrieval and learning without polluting the live context path

The active OM already solves:

- recent continuity
- active compression
- checkpoint advancement

The long-term memory layer should solve:

- durable archival
- consolidation
- pattern discovery
- maintenance of historical knowledge artifacts

## Core Principle

Long-term memory should no longer be a synchronous processor in the main agent path.

It should be:

- asynchronous
- workspace-based
- fed by checkpoint advancement
- maintained by a separate memory workflow/agent when the main agent is idle or on its own schedule

This keeps the main execution path predictable while still allowing memory to deepen over time.

## Source Material For LTM

The preferred sources for LTM are:

- checkpoint summaries
- reflections that leave the active reflection window when the checkpoint advances

Observations should not be the primary source.
They are too local and too close to operational noise.

RAW messages should not go to LTM directly.
The new OM already exists to prevent that.

So the intended hierarchy is:

1. checkpoint summaries
2. archived reflections behind the current checkpoint
3. observations only as optional supporting material stored inside a checkpoint package

## Workspace Structure

The long-term memory workspace should be explicit and file-based.

Two areas should exist:

1. `/checkpoints`

- immutable checkpoint packages written by the system
- historical source material
- never edited by the memory agent

2. `/memory`

- living memory documents maintained by the memory agent
- synthesized knowledge, patterns, playbooks, recurring findings, and durable organizational memory

This separation is important:

- `/checkpoints` is evidence
- `/memory` is maintained knowledge

## Checkpoint Package Shape

Each checkpoint advancement should create one new checkpoint package in the LTM workspace.

Example shape:

```text
workspace-memory/
  checkpoints/
    2026-04-13_001/
      README.md
      reflections/
        reflection_001.md
        reflection_002.md
      observations/
        observation_0001.md
        observation_0002.md
```

The package should contain:

- the checkpoint summary in `README.md`
- the reflections that were moved behind the checkpoint
- optionally, the observation texts that were part of those reflected regions

The package should be immutable after creation.

## Checkpoint Package Semantics

A checkpoint package is the durable record of one checkpoint advancement event.

It represents:

- what the active context left behind
- what was consolidated enough to stop competing for live tokens
- the material the memory subsystem can study later

It should not be edited later.
If later understanding improves, that should happen in `/memory`, not by rewriting historical checkpoint packages.

## Memory Agent Role

The memory agent should work over the LTM workspace, not over live thread messages.

It should:

- read newly created checkpoint packages
- inspect reflections and checkpoint summaries
- optionally inspect bundled observations for detail
- maintain documents under `/memory`
- discover patterns, repeated issues, stable knowledge, and durable operating guidance

It should not:

- mutate checkpoint packages
- interfere with the active OM path
- run synchronously during the main agent generate loop

## Scheduling Model

The long-term memory system should run independently from the active OM.

It should execute:

- when the owning agent is idle
- or on a memory-specific schedule
- or both

Its execution should still respect:

- generate timeout control
- retry/backoff policy
- contract/budget rules
- step logging and observability

But it should have its own lifecycle and should not be a processor in the main context pipeline.

## Desired Memory Outcomes

The long-term memory layer should gradually build documents like:

- recurring entities and relationships
- stable operational facts
- recurring blockers and failure patterns
- preferences and norms that repeatedly show up in work
- evolving domain understanding
- playbooks or guidelines derived from repeated evidence

Those outputs belong in `/memory`, not in the checkpoint packages.

## Retrieval Model

Future retrieval should prefer:

1. active OM context for immediate continuity
2. `/memory` documents for durable synthesized knowledge
3. checkpoint packages when detailed historical evidence is needed

This means checkpoint packages are not just retrieval documents.
They are the durable evidence base from which long-term knowledge can be built.

## Invariants

The new LTM design should obey these rules:

- LTM is downstream from checkpoint advancement
- checkpoint packages are immutable
- `/memory` is mutable and maintained
- active OM and LTM remain separate concerns
- LTM does not run in the main processor path
- RAW messages do not go directly to LTM
- checkpoint summaries and archived reflections are the main LTM intake
- historical source material is preserved, not deleted

## Why This Design Fits The Project

This design fits the current architecture because:

- the OM now owns active context correctly
- checkpoint advancement already creates a clean semantic boundary
- the workspace is already a natural durable substrate for agent-managed knowledge
- file-based history is easy to audit
- keeping LTM async avoids contaminating the main run path

The result is a cleaner split:

- OM manages live context
- checkpoint packages preserve durable history
- the memory agent builds and maintains long-term knowledge
