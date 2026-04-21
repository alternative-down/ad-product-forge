# Architecture Overview

## Purpose

This repository is intended to define and eventually implement a generic runtime core for agents that:

- operate by steps
- assemble context from multiple sources
- may call tools or actions
- may continue across multiple steps
- may accumulate and use memory over time
- may be embedded into many different kinds of host applications

The central architectural goal is to keep the core small, composable, and domain-agnostic.

This is a direct reaction against the architectural failure mode where the first product that uses the system silently becomes the system itself. When that happens, domain assumptions leak into the center of the runtime, and every later use case becomes a fight against the original product shape.

This repository is deliberately trying to avoid that outcome.

## Core Architectural Thesis

The most reusable part of the previous work was not any specific runner, memory implementation, or application workflow. The reusable part was the more abstract pattern underneath:

- inputs arrive over time
- those inputs need to be turned into a bounded, meaningful step context
- the model produces output that may imply actions
- actions produce feedback
- the agent may continue or stop
- some information should remain active only briefly
- some information should survive for much longer
- the runtime needs places where host applications can shape behavior without rewriting the engine

That pattern is broad enough to support many applications:

- NPC cognition in games
- VTuber or desktop companion behavior
- long-running assistants
- social agents
- simulation entities
- world-authoring agents

The architecture should therefore be built around the generic form of this pattern, not around any one product.

## Lowest Useful Level Of Abstraction

The core should be lower-level than a fully opinionated "agent framework", but higher-level than a pile of provider wrappers.

Too high-level would mean forcing concepts like:

- profile
- persona
- chat thread
- storage
- retrieval backend
- world state model

into the center.

Too low-level would mean the library becomes only a thin call wrapper over a model SDK, which would lose most of its value.

The correct level is:

- a step runtime
- with context assembly
- action execution
- loop control
- and an extension mechanism

This gives the library real structure without making it narrow.

## Architectural Layers

The repository should eventually separate concerns into layers.

### 1. Runtime Core

The runtime core is responsible for:

- accepting inputs
- building a step
- invoking the model through an adapter
- executing actions
- handling step outcomes
- deciding whether the loop continues

This is the true heart of the library.

### 2. Plugins And Extensions

Memory, retrieval, scheduling policies, embodiments, storage adapters, and domain behaviors should not be hardcoded into the runtime core. They should plug in through explicit hooks and contracts.

This keeps the core small and keeps extension-specific complexity where it belongs.

### 3. Adapters

Model adapters, action adapters, storage adapters, and domain adapters belong outside the center.

These provide the bridge from the abstract runtime into actual environments:

- AI providers
- filesystems
- game engines
- browser automation
- chat platforms
- TTS/STT systems

### 4. Applications

Applications assemble the pieces.

The same core should be able to support:

- a game NPC runtime
- a VTuber runtime
- a desktop assistant runtime
- a world-creator runtime

The application should define the domain, not the core.

## Strategic Design Principles

### Keep The Center Small

Every concept added to the core should be treated as expensive.

If a concept is not universal, it should not go into the center. If a concept can be expressed as an extension, it should be expressed as an extension.

### Prefer Explicit Boundaries Over Hidden Convenience

The core should not hide important flow decisions behind magic defaults, silent fallback behavior, or invisible state transitions.

Step execution should be easy to trace from top to bottom.

### Prefer Extension Points Over Hardcoded Features

The wrong way to build this would be to say:

- every agent has storage
- every agent has long-term memory
- every agent has recall
- every agent has a scheduler

The better way is:

- the runtime exposes places where those systems can participate
- products opt into those systems only if needed

### Build For Reuse, Not For Maximal Generality

The target is not abstract purity for its own sake.
The target is practical reuse across several real classes of applications.

That means the design should be:

- generic enough to reuse
- concrete enough to implement

## What Must Stay Out Of The Core

To preserve generality, several classes of concepts should stay outside the core.

### Domain Identity Concepts

The core should not require:

- name
- role
- persona
- biography
- alignment
- faction

Those may exist in applications, but not in the runtime center.

### Mandatory Storage

The core should not require:

- database access
- filesystem access
- vector storage
- checkpoint persistence

Those should be optional and external.

### Mandatory Memory Strategy

The core should not force any one memory model:

- no forced raw/overflow split
- no forced checkpoint/reflection architecture
- no forced document memory

Memory should be introduced later through well-defined extension contracts.

### Mandatory Surface Model

The core should not assume:

- chat
- web
- game
- voice
- desktop

It must be usable by all of them.

## What The Core Must Preserve

Even while being generic, the core must still preserve the features that give this whole effort its value:

- continuity across time
- bounded step execution
- the ability to enrich context before each step
- the ability to perform actions and feed results back into the loop
- the ability to stop and resume
- the ability to host memory systems later

That is the actual center of gravity for the design.

## Near-Term Documentation Goal

The immediate purpose of this repository is to define the architecture clearly enough that implementation can proceed one concept at a time without repeating the drift and entanglement of the earlier codebase.
