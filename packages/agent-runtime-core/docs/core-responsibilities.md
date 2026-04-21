# Core Responsibilities

## Why This Document Exists

The easiest way to ruin a reusable runtime is to let the word "core" mean "everything important in the current product." That is not the standard being used here.

This document exists to define what the core is responsible for, what it should never become responsible for, and why these boundaries matter.

## Primary Responsibility Of The Core

The core exists to execute bounded agent steps in a controlled, extensible runtime.

That statement contains the actual responsibilities:

- bounded
- agent
- steps
- controlled
- extensible
- runtime

Every core feature should justify itself against that sentence.

## What The Core Should Do

### 1. Accept Inputs

The core should provide a way to receive inputs from the host application.

The input should be abstract and domain-neutral.
It should not inherently mean:

- chat message
- player action
- sensor frame
- browser event
- world event

Those are host interpretations.
The core only needs to know that something arrived that may affect a future step.

### 2. Assemble Step Context

The core should provide the flow that turns runtime state plus input plus optional extensions into the context for one step.

This is one of the most important responsibilities because it is where many systems later meet:

- recent inputs
- action feedback
- memory contributions
- application-provided context
- system framing

The core should own the pipeline, but not own every source of context.

### 3. Invoke A Model Through An Adapter

The core should define the contract for model invocation and should orchestrate when model calls happen.

The core should not be tied directly to a single provider implementation.
The model layer should be adapter-based.

### 4. Handle Actions

The core should support step outputs that imply or request actions.

This includes:

- discovering action intents from model output
- executing actions through a registered action layer
- capturing action results
- making those results available to future steps

Without this, the system is not really an agent runtime. It is only a prompt execution wrapper.

### 5. Control Continuation

The core should decide how a step transitions into the next runtime state.

At minimum, the runtime needs to represent:

- stop
- continue
- continue later
- wait for new input

The exact policy may vary by application, but the runtime must define where that decision happens.

### 6. Expose Extension Hooks

The core should provide explicit extension points at the major phases of execution.

The runtime should not force memory, retrieval, scheduling, or persistence, but it should offer places where those systems can participate cleanly.

### 7. Provide Introspection Surfaces

The core should make it possible to inspect what happened during execution.

This does not mean the core should include a UI.
It means the runtime should be able to expose structured information such as:

- what input entered the step
- what context was assembled
- what actions were invoked
- why continuation happened

This is necessary both for debugging and for later product observability.

## What The Core Should Not Do

### 1. It Should Not Define Agent Identity

The core should not require:

- agent names
- roles
- personas
- biographies
- factions
- social metadata

Those belong to application-level models.

### 2. It Should Not Require Persistence

The core should not require any specific storage system to function.

In-memory usage should be possible.
Persistent storage should be optional.

### 3. It Should Not Hardcode Memory Strategy

The core should not define one canonical memory architecture for all users.

Different products may want:

- no memory
- recent context only
- checkpointed memory
- semantic document memory
- relationship memory
- event-store replay

The core should host these as extensions, not embed one as truth.

### 4. It Should Not Hardcode Scheduling Policy

The core should support continuation and resumption, but not force one autonomy model.

Some systems are:

- fully reactive
- semi-autonomous
- periodically autonomous
- always-on

The core should support these without deciding them globally.

### 5. It Should Not Encode Product-Specific Semantics

The core should not know about:

- business agents
- game NPCs
- VTubers
- browser assistants
- internal chat
- work contracts
- world events

Those are host meanings built on top of the same runtime.

## Non-Goals

The following are explicitly non-goals for the core:

- being a world simulation engine
- being a storage abstraction framework for everything
- being a UI framework
- being a provider SDK
- being a complete agent product out of the box

The core should be useful without trying to be everything.

## Design Consequences

These boundaries create several consequences for implementation:

- core types must remain abstract
- application-specific metadata must live outside the center
- storage must be injected, not assumed
- model invocation must be adapter-based
- memory must be extension-based
- step state must remain understandable without reading ten side systems

That is the standard implementation must follow later.
