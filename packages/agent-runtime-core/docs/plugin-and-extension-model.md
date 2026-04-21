# Plugin And Extension Model

## Purpose

The plugin and extension model exists to solve a specific problem:

the core must stay small, but the runtime must still be able to grow into real systems.

Without extensions, the core becomes too weak to be useful.
Without a disciplined extension model, the core becomes a dumping ground for every feature that mattered in the first application.

This document defines how to avoid both failure modes.

## Why Extensions Matter Here

Several major capabilities are valuable, but not universal enough to belong in the core:

- short-term memory
- long-term memory
- recall
- scheduling policies
- persistence
- metrics
- domain adapters
- embodiment layers

All of these should be able to participate in the runtime.
None of them should be hardwired into the center.

That means the extension model is not optional. It is one of the central architectural devices of the repository.

## Extension Philosophy

Extensions should not mutate the runtime in arbitrary ways.

They should have:

- clear hook points
- bounded access
- predictable responsibilities
- explicit data flow

The runtime should be able to say:

- what an extension can observe
- what an extension can contribute
- what phase an extension belongs to

This is essential for keeping the system understandable.

## Extension Categories

Not all extensions are the same. It is useful to think in categories.

### Context Extensions

These add information to the step context.

Examples:

- recent memory
- retrieved long-term items
- application state framing
- current world-state summary
- current browser summary

These should enrich context without hijacking execution control.

### Lifecycle Extensions

These observe and react to runtime phases.

Examples:

- metrics
- trace capture
- debug snapshots
- event journaling

These should not need to change core logic in order to be useful.

### Behavior Extensions

These influence decisions about continuation or runtime state.

Examples:

- scheduling policy
- reminder policy
- background autonomy policy

These are more powerful and should therefore be more carefully bounded.

### Memory Extensions

These maintain state across steps or across long spans of time.

Examples:

- recent-context memory
- checkpointed memory
- relationship memory
- episodic memory
- semantic document memory

These are likely to become a major family of optional packages later.

### Action Extensions

These register or augment available actions.

Examples:

- browser tools
- filesystem tools
- world interaction tools
- speech tools
- UI update tools

These should remain external to the core, even though the core understands the abstract notion of action execution.

## Hook Design Principles

Hooks should be designed so that they:

- expose a stable phase boundary
- provide typed inputs
- provide clearly scoped outputs
- avoid hidden side channels

The runtime should not devolve into a system where every extension can arbitrarily rewrite everything at every phase. That would recreate the same complexity this repository is trying to leave behind.

## Likely Hook Points

The eventual runtime will probably need hooks around the main phases of execution.

Likely candidates:

- input received
- before context assembly
- after context assembly
- before model call
- after model call
- before actions
- after actions
- before continuation decision
- after step completion

Each hook should have a narrow purpose.

For example:

- a context hook should contribute context
- a lifecycle hook should observe
- a continuation hook should influence continuation decisions

These responsibilities should not blur.

## Extension Data Model

An extension should not need private access to everything.

Instead, the runtime should expose structured extension contexts such as:

- current pending inputs
- current assembled step context
- current step output
- current action results
- current runtime state snapshot

And extensions should respond in constrained ways such as:

- contribute context
- contribute post-step state updates
- contribute continuation hints
- emit trace or metrics data

This keeps extension logic composable.

## Memory As Extensions, Not As Core

This repository should be especially strict about memory.

Memory is one of the most tempting places to overfit the core to a single architecture.

The core should therefore support memory through extension contracts such as:

- contribute active context
- observe finished steps
- persist memory artifacts externally
- provide recall candidates

But it should not force any one memory model.

That is one of the most important architectural safeguards in this project.

## Storage As Extension Dependency, Not Core Dependency

Extensions may depend on storage.
The core should not.

That means:

- a filesystem memory extension can exist
- a SQLite checkpoint extension can exist
- a vector-backed recall extension can exist

without the runtime core requiring those things for simple use.

## Applications Should Compose Extensions

The host application should be the place where the full runtime is assembled.

For example:

- a game might compose recent memory, relationship memory, and world event adapters
- a VTuber might compose chat ingestion, browser tools, TTS, and long-term recall
- a desktop assistant might compose filesystem actions and a recent-task memory layer

This is the intended use of the library.

The core should remain the execution substrate that makes this composition reliable.
