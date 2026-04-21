# Runtime Flow

## Purpose

This document explains how the runtime actually behaves today.

The architectural intent matters, but once code exists, the concrete execution flow matters more. This document is therefore written against the implementation, not only against the theory.

## Main Runtime Loop

The current runtime flow centers on `AgentRuntime`.

At a high level:

1. Inputs are dispatched into the runtime.
2. The runtime holds those inputs in a pending queue.
3. A call to `step()` or `run()` begins execution.
4. Context is assembled from current pending inputs, previous action results, and plugin-provided context.
5. The model adapter receives a `StepModelRequest`.
6. The model returns a `StepModelResponse`.
7. Requested actions are executed in order.
8. Action results are stored on the runtime.
9. A `StepRecord` is created.
10. Continuation state is updated.
11. Plugins observe the finished step.
12. The runtime becomes idle again unless the caller asks it to continue with another step.

This is the current canonical flow.

## Dispatch Phase

`dispatch()` does one thing:

- normalize the input
- append it to the pending queue
- notify plugins through `onDispatch`

It does not automatically run the model.

This is deliberate.
The runtime currently separates:

- input arrival
- step execution

That keeps the step loop explicit.

## When `step()` Runs

`step()` runs only if one of these is true:

- there are pending inputs
- continuation was requested by the previous step

Otherwise it returns `null`.

This makes `step()` a clean bounded primitive.

## Context Assembly Phase

The context for a step is assembled in three layers.

### 1. Current Inputs

Every current pending input becomes a `StepContextEntry`:

- `kind` is derived from the input type
- `title` follows the input type
- `text` is currently a JSON stringification of the payload

This is intentionally simple.

### 2. Previous Action Results

If the previous step executed actions, those results are added as one context entry:

- kind: `action-results`
- title: `Previous action results`

This allows the next step to respond to what just happened.

### 3. Plugin-Contributed Context

Every registered plugin gets a chance to return additional `StepContextEntry[]`.

This is where:

- static framing
- recent step replay
- recall
- any future memory logic

can participate without living inside the runtime center.

## Model Invocation Phase

After context assembly, the runtime creates a `StepModelRequest` with:

- runtime id
- step id
- step number
- assembled context
- action descriptors

That request is given to the configured `StepModelAdapter`.

The core runtime does not know how that adapter works internally.

## AI-SDK Adapter Flow

The current `ai-sdk` adapter uses:

- `generateText`

with a tool surface that exposes:

- runtime actions
- `runtime_continue`
- `runtime_wait`

This is an important design choice.

The adapter now relies on provider-native tool calling.

Why this matters:

- it keeps the runtime contract stable
- it keeps real input schemas available to the model
- it avoids custom structured-output parsing in the center

The adapter remains a translation layer.
The runtime still owns action execution, state mutation and continuation handling.

## Action Execution Phase

If the model requests actions, the runtime executes them sequentially.

For each action:

1. the runtime looks it up in the registry
2. validates the input through the Zod schema
3. calls the action's `execute`
4. stores the action result

The runtime currently assumes action execution should be straightforward and explicit.

It does not currently implement:

- retries
- fallback handling
- compensating transactions
- partial failure recovery

That is intentional at this stage.

## Continuation Phase

The model returns one of:

- `stop`
- `continue`
- `wait`

The runtime stores whether continuation was requested.

Current behavior:

- `continue` means the next `step()` can run even without new pending input
- `stop` and `wait` both end the current run loop in practice

That is enough for the current slice.
Later versions may give `wait` more scheduling meaning.

## Recording Phase

At the end of each step, the runtime creates a `StepRecord` containing:

- ids and timestamps
- the inputs consumed by the step
- the full assembled context
- the raw model response
- the action results
- the continuation decision

This is the current trace surface.

It is intentionally direct.
The runtime does not yet hide or compress this record.

## Plugin Observation Phase

After the step is recorded:

- plugins receive `onAfterStep`
- the runtime snapshot is available

This allows extensions to observe completed steps without controlling the core execution path.

## `run()` Flow

`run()` is a thin loop over `step()`.

It repeatedly calls `step()` until:

- `step()` returns `null`
- continuation is not `continue`
- or `maxSteps` is reached

This is intentionally small and predictable.

The runtime does not currently mix scheduling policy into `run()`.

## Scheduler Flow

The optional `InMemoryRuntimeScheduler` is not part of `AgentRuntime`.

It is a separate utility that can:

- schedule delayed dispatch
- schedule recurring dispatch
- optionally call `runtime.run()` after dispatch

This separation is important.
The scheduler extends runtime use without making scheduling a mandatory concern of the core.

## Extension Flows Already Present

The repository already contains examples of the extension model in practice.

### Recent Steps Plugin

Reads recent `StepRecord`s and converts model segments into new context entries for future steps.

This shows how "short memory-like" behavior can live outside the center.

### Static Context Plugin

Injects fixed context entries into every step.

This shows how framing/instructions can remain external.

### In-Memory Recall Plugin

Builds a query from runtime state, retrieves external documents through a host-provided function, filters repeats through an in-memory dedupe window, and injects results into context.

This is especially important because it proves that recall can be a plugin pattern rather than a built-in memory engine.

## Current Flow Quality

The current runtime flow is still small, but it already has the most important property:

it is easy to read from top to bottom.

That is the standard future work should preserve.
