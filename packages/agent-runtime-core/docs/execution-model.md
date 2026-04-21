# Execution Model

## Overview

The execution model is the real center of the library.

If this part is wrong, everything else becomes a pile of patches.
If this part is clear, memory, tools, persistence, autonomy, and product adapters can all attach to it in a disciplined way.

The core execution model should be based on steps.

A step is a bounded unit of cognition and action orchestration.
It is not an entire session, not an entire conversation, and not an entire background workflow.
It is one execution unit in a longer process.

## High-Level Loop

At the most abstract level, the runtime should support the following flow:

1. One or more inputs enter the runtime.
2. The runtime assembles the context for the next step.
3. The runtime invokes the model.
4. The runtime interprets the model output.
5. If the output implies actions, those actions are executed.
6. The results of those actions are fed back into runtime state.
7. The runtime decides whether another step should occur.
8. The runtime either stops, waits, or continues.

This is the loop the system must make explicit.

## Why Steps Matter

The step abstraction is important because it gives the runtime boundaries.

Without steps, agent systems tend to become one of two bad things:

- a giant continuous loop with no clear phase boundaries
- or a chat wrapper that cannot coordinate action and memory well

A step creates a stable place for:

- context assembly
- tool execution
- continuation decisions
- state updates
- memory hooks
- debugging

## Input Model

The runtime should accept inputs as abstract runtime stimuli, not as one domain-specific class such as chat messages.

The host application should be able to represent many kinds of input:

- a user utterance
- an external event
- a timer tick
- a game-world event
- a browser observation
- a voice transcription
- an internal reminder

The runtime should not interpret the domain meaning of those inputs. It should only support their participation in the step pipeline.

## Context Assembly

Context assembly should be a first-class phase of execution.

This phase should gather and merge:

- recent pending input
- prior step outputs if still relevant
- action feedback
- runtime state
- extension-provided context
- application-provided context
- static or semi-static framing

What matters is not that every runtime uses all of these, but that the place where they are combined is explicit and inspectable.

This phase should not be hidden inside unrelated modules or provider wrappers.

## Model Invocation

Model invocation should happen through an adapter.

The runtime should not care whether the underlying provider is:

- OpenAI
- Anthropic
- a local model
- a provider routed through `ai-sdk`
- something lower-level later

The runtime should care about the contract:

- what input the model receives
- what tool surface the runtime exposes
- what metadata comes back

This is where the library keeps generality without giving up control.

## Output Interpretation

A model response is not the end of a step.
It is only one phase in the step.

The runtime needs to interpret the response in terms of:

- plain output
- action intent
- continuation intent
- state consequences

This should be explicit.

The worst version of this system would allow action calls and continuation semantics to be discovered ad hoc in ten different places. That must be avoided.

## Action Execution

Actions are part of the step lifecycle, not an unrelated side system.

The runtime must provide a coherent way to:

- register actions
- invoke actions
- collect results
- propagate results back into the execution loop

This is what allows the model to participate in real systems instead of only producing text.

At the same time, actions must remain abstract.

The core should not know whether an action means:

- write a file
- move an NPC
- talk in chat
- open a web page
- update a scene
- emit speech

That belongs to the action registry supplied by the host application.

## Continuation

Continuation must be explicit and simple.

The runtime needs to support the idea that one step may or may not lead to another.

At minimum, the step result should distinguish:

- finished for now
- continue immediately
- continue after feedback/action result
- wait for later external input

The exact encoding can be refined later, but the concept should be fixed early.

The runtime should not bury continuation in unrelated exception handling or product-specific branching.

## State Transition Model

Even if the final implementation does not use a formal state machine library, the step lifecycle should still behave like a state machine.

The runtime should move through clearly distinguishable phases:

- idle
- preparing
- executing
- acting
- evaluating continuation
- waiting

This matters because invisible or implicit transitions are where complexity hides.

## Hooks Around The Step

Each step should expose clean places for extension logic.

Likely hook points:

- before input normalization
- before context assembly
- after context assembly
- before model invocation
- after model invocation
- before action execution
- after action execution
- before continuation decision
- after step completion

This allows memory, recall, metrics, logging, and scheduling logic to be added without contaminating the core loop.

## Replay And Determinism

The runtime should not promise full determinism, because model calls and external tools may not be deterministic.

However, the runtime should still make step execution inspectable enough that a host can reconstruct:

- what went into a step
- what came out
- what actions occurred
- why the next state was chosen

That level of traceability is important for both development and operations.

## Summary

The execution model should remain the cleanest and most carefully designed part of the repository.

Everything else will grow around it.
If this stays explicit, bounded, and composable, the rest of the system has a chance to remain healthy.
