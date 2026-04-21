# Applications And Use Cases

## Purpose

This document exists to keep the architecture grounded in real classes of use.

A generic runtime with no application picture becomes abstract in unhelpful ways.
A runtime designed around one product becomes hard to reuse.

The right approach is to remain grounded in several concrete application families at once.

## Use Case Family 1: Game NPCs

The runtime should be able to support NPC cognition in games where characters:

- react to events
- remember interactions
- take actions through constrained systems
- preserve continuity over time

The runtime should not itself be a game engine.
But it should be capable of living inside one.

Important capabilities for this domain:

- event-driven perception
- bounded step execution
- relationship-sensitive memory extensions
- action adapters for world interaction
- optional long-term recall

## Use Case Family 2: Village / Business Life Sim

A particularly attractive use case is a local economic-social sim such as:

- blacksmith
- carpenter
- alchemist
- workshop owner

In such a game, NPCs can:

- remember quality and delays
- remember favors and debts
- spread rumors
- develop trust or resentment
- create emergent requests

This domain benefits strongly from persistent memory and step-based action loops.

## Use Case Family 3: VTuber And Embodied Assistants

The runtime should also support animated or embodied agents that:

- read chat
- speak through TTS
- observe via vision
- browse or interact with tools
- preserve identity continuity over time

In this domain, the same runtime pattern still applies:

- inputs arrive
- context is assembled
- a model reasons
- actions occur
- output is emitted
- memory updates

Only the embodiment surface changes.

The repository now has small reference compositions for this family under `src/examples`.

Those modules are intentionally not part of the exported framework surface.
They only prove that the core can already support:

- chat-driven runtime input
- vision observation dispatch
- realtime speech transcription loops
- avatar presentation as a separate concern

## Use Case Family 4: Desktop Or Personal Companions

The same runtime can support assistants that:

- observe user workflows
- remember preferences
- act through limited tools
- maintain continuity over time

This is a different domain from games, but the execution structure is still closely related.

The current workspace and browser reference compositions also pressure-test this family without introducing any desktop-only model in the center.

## Use Case Family 5: World Creator / Architect Agents

A more ambitious domain is a creator agent that shapes a world through a constrained internal authoring system.

This can include:

- scene creation
- NPC generation
- event creation
- quest creation
- structured world edits

Again, the runtime is not the content engine itself. It is the cognitive and action substrate that can drive one.

The repository does not yet have a full creator-world scaffold.
That is still future work.
But the current pieces that matter for it already exist:

- browser and workspace gateways
- provider gateway contracts
- retrieval and long-term memory modules
- filesystem persistence surfaces

That is enough groundwork to continue toward authoring agents without needing to distort the runtime center later.

## Architectural Consequence

Because these use cases differ so much in surface form, the core must remain focused on what they genuinely share:

- step execution
- context assembly
- action handling
- continuation
- memory extension points

That is the common denominator.

## What Success Looks Like

The architecture is successful if it can support all of the following without deforming the core:

- a simple in-memory assistant
- a game NPC
- a VTuber shell
- a creator-world prototype

If supporting those examples requires turning the core into a product-specific framework, the architecture has failed.
