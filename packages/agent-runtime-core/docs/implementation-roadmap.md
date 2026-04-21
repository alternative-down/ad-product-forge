# Implementation Roadmap

## Purpose

This roadmap exists to keep implementation disciplined.

The previous codebase showed what happens when important concepts are added incrementally without being closed cleanly before the next layer is introduced. The result is architectural drift, blurred responsibilities, and growing local complexity.

The roadmap below is designed to prevent that outcome.

## Strategic Rule

Implementation should proceed one concept at a time.

Each major addition should be followed by review and refactoring before the next major addition is accepted. The objective is not to move fast through feature checklists. The objective is to preserve clarity in the center of the system.

## Phase 1: Define Core Types And Contracts

The first implementation phase should not be memory, persistence, or retrieval.
It should be the minimal contracts that make the runtime real.

That likely includes:

- runtime input type
- step context type
- model adapter contract
- action definition and action result contracts
- step output contract
- continuation contract
- extension hook contracts

This phase should end only when the public conceptual surface feels coherent.

## Phase 2: Build Minimal Step Runtime

The second phase should implement the smallest meaningful execution flow.

That runtime should:

- receive input
- build one step context
- invoke the model adapter
- interpret action requests
- execute actions
- decide continuation

This phase should be intentionally small.
It should not yet contain:

- memory systems
- persistence
- retrieval
- scheduling complexity

The goal is to close the execution loop cleanly first.

## Phase 3: Introduce Hooked Extension Participation

Once the minimal runtime is correct, extensions should begin participating in the lifecycle.

This phase should validate:

- context contribution hooks
- lifecycle observation hooks
- post-step mutation hooks
- continuation influence hooks

At this stage the question is not "can we add many plugins?" but "is the extension model structurally correct?"

## Phase 4: Add Minimal In-Memory Runtime State

Before persistent memory systems, the runtime will likely need simple in-memory state support.

This may include:

- pending inputs
- step-local feedback carryover
- current continuation state
- extension-private runtime state

This should still remain storage-free.

## Phase 5: Add AI-SDK Adapter

The `ai-sdk` adapter should then become the first real model integration package.

This phase should remain focused on translation and invocation:

- runtime request shape -> provider request shape
- provider response shape -> runtime output shape

It should avoid pulling provider-specific quirks into the core.

## Phase 6: First Real Example

Before memory systems get deep, build one small example.

The example should prove:

- runtime usability
- action execution
- continuation behavior
- extension hooks working in practice

The point is to test the architecture under use, not under theory only.

## Phase 7: Introduce Optional Memory Extensions

Only after the runtime is stable should memory enter.

And even then, memory should begin small:

- recent-context memory extension
- simple step-history recall

Do not begin with the most complex memory design immediately.

## Phase 8: Introduce Persistence As Optional Infrastructure

Persistence should arrive after the runtime and its extension model are already proven in memory.

This keeps the architecture from being deformed by storage concerns too early.

At this point:

- in-memory runtime remains valid
- filesystem or database packages become optional support

## Phase 9: Advanced Memory And Recall

Only now should more advanced systems be introduced:

- checkpoint-style memory
- long-term document memory
- retrieval
- consolidation workflows

This phase should be informed by actual earlier usage, not only by previous implementation baggage.

## Phase 10: Domain Examples

Once the foundation is healthy, create examples that prove the architecture across domains:

- game NPC
- VTuber shell
- autonomous helper
- creator-world prototype

These examples are not extra. They are evidence that the design is truly reusable.

## Ongoing Review Rule

After each phase:

- review architecture
- simplify
- remove accidental complexity
- rename for clarity
- collapse unnecessary wrappers
- refuse compatibility baggage

This repository should be willing to discard early implementation quickly if it reveals a cleaner shape.

That discipline is necessary if the goal is a reusable foundation rather than another application-shaped codebase.
