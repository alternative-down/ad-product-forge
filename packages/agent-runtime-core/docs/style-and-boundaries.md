# Style And Boundaries

## Purpose

This document captures the implementation style and codebase discipline that the repository should follow from this point forward.

The repository is trying to become a reusable foundation, not just a functioning codebase. That means implementation style is not merely cosmetic. It directly affects how much architectural drift the project accumulates over time.

## General Style

The repository should prefer:

- explicit runtime flow
- linear code
- obvious naming
- small public surfaces
- direct types
- explicit composition

The repository should avoid:

- hidden orchestration
- sprawling helper layers
- local compatibility hacks
- generic naming that hides responsibility
- defensive repair logic in the middle of the flow

## One Main Concept Per File

Files should be organized around one clear concept.

Good examples already present:

- `src/core/runtime.ts`
- `src/core/actions.ts`
- `src/adapters/ai-sdk.ts`
- `src/extensions/in-memory-recall.ts`
- `src/scheduler/in-memory-runtime-scheduler.ts`

The goal is that a reader can open a file and understand what concept it owns without reconstructing that fact from five imported helpers.

## Avoid Helper Sprawl

Helpers should exist only when they reduce real complexity.

The repository should resist:

- tiny wrappers around one line of logic
- helper extraction that only obscures the main flow
- multi-file orchestration for otherwise linear logic

This is especially important in the runtime center.

The main loop should remain readable top-to-bottom in one file.

## Boundaries To Protect

### Runtime Core Boundary

The runtime core should remain focused on:

- step execution
- context assembly
- action execution
- continuation

It should not casually absorb:

- storage logic
- memory subsystem logic
- scheduling policy
- domain models

### Adapter Boundary

Adapters should translate between the runtime and an external system.

They should not:

- redefine the core
- hide runtime behavior
- inject provider-specific semantics into the center

### Extension Boundary

Extensions should enrich the runtime without mutating its conceptual center.

If an extension starts feeling mandatory for all realistic uses, that is a signal to revisit whether the concept actually belongs in the core. But that promotion should be deliberate.

### Utility Boundary

Schedulers and similar orchestration helpers should stay outside the core until there is strong evidence that they belong in the center.

## Typing Standards

The repository should use:

- strict TypeScript
- explicit exported types
- generic parameters only when they add real value
- Zod at external boundaries

The repository should avoid:

- `any`
- wide opaque bags of optional fields
- internal shape repair after the boundary

The system should prefer correct internal types over defensive middle-flow checks.

## Testing Standards

Tests should validate:

- runtime flow
- action execution
- extension participation
- scheduler behavior

The tests should focus on:

- execution correctness
- boundary behavior
- architectural invariants

The tests should avoid:

- snapshot noise
- provider-dependent live behavior
- incidental internal details that make refactors painful

This is why `FakeStepModelAdapter` exists and should continue to exist.

## Documentation Discipline

This repository should keep documentation synchronized with implementation.

At minimum, changes should update whichever of the following they affect:

- public API
- runtime flow
- architectural decisions
- implementation roadmap

The code should not quietly drift away from the written architecture.

## Refactoring Rule

Every meaningful new capability should be followed by architectural review.

Questions to ask after each addition:

- Did this add a new core concept, or should it have been an extension?
- Did this make the runtime loop harder to read?
- Did we create a helper only to avoid reading direct code?
- Did we push domain semantics into a generic layer?
- Is the public surface still obvious?

If the answer reveals drift, refactor immediately while the surface is still small.

## Current Direction

The current direction is healthy because:

- the core is still small
- extensions are proving useful
- scheduler logic remains outside the center
- the adapter boundary is clear
- tests are fast and local

The main risk from here is not lack of features.
The main risk is allowing future useful features to enter the wrong layer.

This document exists to keep that from happening.
