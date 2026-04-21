# Architecture Decisions

## Purpose

This document records the key architectural decisions already made in the repository.

It is easier to keep a codebase coherent when decisions are written down explicitly instead of only existing as temporary local intent in the latest round of implementation.

These decisions should be revisited only when there is a real architectural reason, not because another feature happens to become easier under a weaker design.

## Decision 1: The Core Is Step-Centered

The runtime is designed around bounded steps.

Reason:

- steps create traceable phase boundaries
- they provide a clean place for context assembly
- they provide a clean place for action execution
- they make continuation explicit
- they make extensions easier to attach

Rejected alternative:

- a more amorphous continuous loop with blurred phases

Why rejected:

- it makes architecture hard to reason about
- it invites hidden state transitions
- it makes debugging much worse

## Decision 2: The Core Does Not Require Identity

The runtime does not require:

- name
- role
- persona
- profile
- biography

Reason:

- those are domain concepts
- many products will want them
- but they should not define the center of the library

The runtime should host these through application context, not through mandatory core fields.

## Decision 3: The Core Does Not Require Storage

The current runtime is fully usable in memory.

Reason:

- storage is not universally required
- making storage mandatory would distort the core too early
- storage concerns belong to optional packages or adapters

This is one of the most important boundaries in the repository.

## Decision 4: Actions Belong To The Runtime, Not To The Provider Adapter

Actions are represented as runtime concepts:

- registered in the runtime
- validated in the runtime
- executed in the runtime

Reason:

- actions are part of the execution model
- provider adapters should not own business execution semantics
- the runtime needs a stable action surface regardless of which model adapter is used

Rejected alternative:

- model-provider-specific tool systems as the primary action abstraction

Why rejected:

- it would make the runtime more provider-shaped than runtime-shaped

## Decision 5: Plugins Are The Main Growth Mechanism

New capabilities should enter through plugins or optional utilities before they are promoted into the core.

Reason:

- the core should remain small
- many capabilities are useful but not universal
- plugins allow capability growth without central contamination

This decision is already reflected in:

- recent steps plugin
- static context plugin
- in-memory recall plugin

## Decision 6: Scheduling Stays Outside `AgentRuntime`

The optional scheduler was implemented as a separate utility rather than a built-in runtime concern.

Reason:

- not every runtime needs scheduling
- delayed or recurring dispatch is useful
- but it should not become mandatory center logic

This preserves a clean separation between:

- execution core
- orchestration utilities

## Decision 7: The `ai-sdk` Adapter Uses Tool Calling

The current adapter uses `generateText` with tools.

That tool surface includes:

- runtime actions
- internal continuation tools:
  - `runtime_continue`
  - `runtime_wait`

Reason:

- it keeps the adapter aligned with provider-native tool semantics
- it preserves real input schemas from the runtime action registry
- it avoids structured-output envelopes and custom response parsing in the center of the library

The runtime still owns actual action execution.
The adapter only translates tool calls and content parts back into the runtime response shape.

## Decision 8: Zod Is Used Only At Boundaries

The core does not scatter validation throughout the middle of the execution flow.

Zod is currently used at the action input boundary.

Reason:

- input validation belongs at boundaries
- internal runtime state should be typed correctly, not repaired repeatedly
- this keeps the flow linear

## Decision 9: Runtime Records Stay Rich And Explicit

The current `StepRecord` stores:

- inputs
- context
- model response
- action results
- continuation
- timestamps

Reason:

- at this stage clarity is more important than compression
- the repository still needs strong observability while the center is being shaped

Later compression or persistence strategies may emerge, but not before the basic shape is stable.

## Decision 10: The Repository Is Documentation-Driven

The repository started with extensive documentation before implementation.

Reason:

- the previous system showed that code-first growth without explicit boundaries causes drift
- this repository needs architectural memory, not only code

This decision should remain active:

- write the boundary
- then implement the boundary
- then update the docs when reality changes

## Decision 11: Observers Are Separate From Plugins

The runtime now has both plugins and observers.

Reason:

- plugins can participate in behavior
- observers are for host-side visibility
- UI, telemetry and orchestration should not need to masquerade as behavioral extensions

This keeps a clean distinction between:

- runtime behavior growth
- external monitoring

## Decision 12: In-Memory Retrieval Primitives Support Incremental Upsert

The first retrieval primitives originally cleared all indexed documents every time `index(...)` was called.

That was too destructive for durable memory use.

Reason for change:

- long-term memory grows incrementally
- recall systems need stable previously indexed material
- the runtime should not rely on replacement semantics hidden behind a generic method name

The current decision is:

- in-memory keyword and vector indexes treat `index(...)` as upsert for the provided documents

If full replacement is needed later, it should be modeled explicitly rather than hidden in the default method.

## Pending Decisions

Some important decisions remain intentionally open:

- whether memory should gain a more formal extension contract beyond the current plugin surface
- whether operational memory should later gain first-class checkpoint and reflection layers
- how much runtime state should later be abstracted behind storage or journaling contracts
- how to represent more advanced continuation policies without overfitting the core

These should be solved when real pressure appears, not in anticipation of every future feature.
