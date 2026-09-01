# Code Style

This repository values code that is easy to follow, easy to locate, and easy to change.

The goal is not abstraction.
The goal is clarity.

## Source of truth

The primary source of truth is what has already been established in this repository and what has been explicitly aligned during implementation reviews.

If a generic principle conflicts with that, the repository rule wins.

## Core criteria

Every implementation should be judged first by these four points:

- concept
- responsibility / concern
- boundary
- readable flow

If these four are correct, most style decisions become obvious.

## Practical philosophy

### Clean Code, adapted

Use Clean Code ideas where they improve clarity.
Do not apply them mechanically.

Keep:

- clear names
- clear responsibilities
- one consistent level of abstraction in a flow
- direct code that is easy to reason about

Do not over-apply:

- micro-functions
- helper extraction for trivial code
- fake purity when a contained mutable closure is simpler
- abstractions that force the reader to jump around the codebase

### KISS / YAGNI

Prefer the simplest code that solves the current problem.
Do not build around possible future needs.
Do not add machinery “just in case”.

Avoid speculative:

- retries
- queues
- caches
- fallback layers
- defensive wrappers
- generic infrastructure with no current need

### DRY, constrained by clarity

Avoid real duplication.
Do not chase DRY if it makes the code harder to read.

If two short blocks are similar but the flow becomes worse when extracted, keep them inline.

## Organize by concept

A file should exist because it owns a real concept.

Examples of concepts:

- communication module
- communication store
- discord provider
- wake queue
- oauth gateway
- agent builder

Examples of things that are often only actions inside a concept:

- save
- sync
- ingest
- normalize
- parse
- update

Do not split one concept into arbitrary verb files.
Do not merge multiple unrelated concepts into one file because they happen in sequence.

## Separate responsibilities

Each module should do one kind of job.

Examples:

- a store persists and queries state
- a provider talks to an external platform
- a module orchestrates use cases and contracts
- a builder composes components
- an app wires concrete runtime pieces together

Do not mix these roles.

Wrong direction is one of the most common sources of confusion.
If a generic module is supposed to control the flow, the provider should not drive that flow.
If a store is supposed to persist data, it should not own orchestration logic.

## Respect boundaries

Boundaries should be explicit and visible.

Common boundaries here:

- external provider -> internal module contract
- app wiring -> reusable package
- module orchestration -> persistence
- unknown input -> validated input

Code should make those handoffs obvious.

Good:

- provider returns provider-shaped data
- communication module translates it into internal state
- store persists internal state
- tools expose sanitized internal views

Bad:

- provider mutating internal state directly
- store understanding provider behavior
- app-specific runtime decisions leaking into reusable package code

## Prefer linear code

A reader should be able to read the main flow from top to bottom.

Good flow usually looks like:

1. gather dependencies
2. create the core component
3. create the object that uses it
4. start or connect runtime-only integrations
5. return the final value

Avoid:

- forward references that make setup order hard to trust
- temporary state just to bridge initialization order
- attach/patch steps when construction or a single start step is clearer
- hidden lifecycle spread across many methods

If something needs a start phase, make that start phase explicit.
If configuration belongs together, pass it together.

## One file, one main idea

A file should have one main idea.

That does not mean one method.
It means everything in the file belongs to the same concept.

Good:

- one store file with store operations
- one provider file with provider behavior
- one builder file with builder composition

Bad:

- file as a bag of unrelated helpers
- file mixing storage, provider logic, and app wiring

## One top-level function when the file is function-shaped

If a file is centered on a function, prefer one top-level function in that file.

Examples:

- `createCommunicationStore()`
- `createCommunicationModule()`
- `createDiscordProvider()`
- `createForgeAgent()`

Inner functions are fine when they belong directly to that concept.
What should be avoided is many unrelated top-level helpers with no clear owner.

## Validate at the boundary

Validate unknown input where it enters the system.
Prefer Zod.

Do not scatter ad-hoc runtime checks through the middle of the code.
The middle of the flow should operate on already-valid data.

## Avoid defensive programming in the middle of the flow

Do not write code around hypothetical failure modes unless the failure is real and current.

Avoid unnecessary:

- repeated guards for impossible states created by our own setup
- fallback branches for states we should not create
- type casts that hide a modeling problem
- workarounds instead of fixing the source of the problem

If the flow feels like it needs many guards, step back and fix the shape of the flow.

## Prefer `const`

Use `const` by default.
Use `let` only when mutation is an intentional part of the design.

Do not use `let` to work around setup order.
Fix the setup order instead.

## Use contained closures carefully

Closures are fine when they clearly belong to one concept and make the code simpler.

Good uses:

- a store closing over its database client
- a provider closing over its SDK client
- a queue closing over its timer state

Bad uses:

- closures used to hide awkward setup order
- closures that make dependencies implicit instead of explicit
- closures that create lifecycle confusion

## Prefer explicit start over implicit lazy setup

If a component needs initialization, prefer doing it once during creation or in an explicit start step.

Do not hide repeated initialization inside every method when the component can be initialized once up front.

Good:

- create component
- initialize schema/resources
- expose ready-to-use operations

Bad:

- every method internally checking and initializing the same setup

## Keep tool outputs internal and clean

Tools should expose the agent-facing internal model, not raw provider data.

Do not leak provider-specific external ids, usernames, metadata, or transport details in tool results unless that is explicitly required by the product design.

The communication module should translate provider data into internal ids and internal views before it reaches the agent.

## Composition over scattered control

When one module owns the flow, pass the dependencies it needs and let it orchestrate them.

Do not spread that orchestration across the caller with repeated manual steps when the steps belong together.

Good:

- builder creates agent
- builder creates wake queue
- builder starts communication with providers and wake callback

Bad:

- caller manually loops providers one by one for a module that should own provider startup
- caller wires half the lifecycle before construction and half after construction without a clear reason
