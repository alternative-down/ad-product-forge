# agent-runtime-core

`agent-runtime-core` is a new repository intended to become a reusable foundation for persistent, step-based, tool-using agents that can be embedded into very different kinds of products.

The goal is not to recreate the current application architecture from `ad-product-forge`.
The goal is to extract the real conceptual base that proved valuable and redesign it as a generic, clean, low-assumption library that can support:

- living NPC systems for games
- persistent world actors
- VTuber and embodied assistants
- desktop companions
- social simulation agents
- creator-world agents
- long-running operational agents

This repository starts with documentation first, because the previous project made it clear that implementation without hard conceptual boundaries quickly turns into local fixes, accidental coupling, and architecture drift.

## What This Repository Is

This repository is meant to become:

- a small and explicit runtime core for step-based agents
- a system with strong extension points instead of heavy built-in assumptions
- a foundation that can be embedded in many projects
- a library that does not force chat, UI, storage, or product-specific concepts into the center of the design

## What This Repository Is Not

This repository is not intended to be:

- a rewrite of the Forge application
- a cleaned-up wrapper around Mastra
- a framework that assumes chat as the primary surface
- a game engine
- a storage system
- a world simulation system
- a UI toolkit

Those concerns may later be supported by optional packages, adapters, or examples, but they should not define the core.

## Design Position

The core should assume as little as possible while still providing something meaningful.

That means the center of the design should not be:

- identity
- profile
- role
- storage
- filesystem
- vector search
- world model
- browser model
- chat model

The center of the design should be:

- step execution
- context assembly
- model interaction
- action execution
- continuation
- extensibility

Everything else should either be optional or layered on top.

## Current Status

This repository currently contains the architectural documentation that defines:

- the intended scope of the core
- the responsibilities and non-goals of the runtime
- the execution model
- the plugin model
- the boundary between core and extensions
- the proposed module layout
- the implementation roadmap
- example application domains

It also already contains a first executable implementation slice:

- a generic step runtime
- a model adapter contract
- an action registry with typed Zod input validation at the boundary
- a plugin system for context and lifecycle hooks
- in-memory runtime state
- a first `ai-sdk` model adapter
- generic context extensions
- observer hooks for hosts and UIs
- reusable async event-channel primitives for runtime-side streams and bridges
- optional mutable context-note state
- optional runtime journaling primitives
- an optional in-memory scheduler utility
- keyed runtime scheduling for multi-runtime orchestration
- optional filesystem persistence for journal, notes, long-term documents and skills
- filesystem-backed usage metering
- explicit runtime snapshot restore and filesystem snapshot storage
- filesystem-backed operational memory
- optional operational-memory and long-term-memory modules
- retrievable filesystem-backed long-term memory, not just document storage
- buffered realtime STT adapter built on top of batch speech transcription
- concrete MiniMax integrations for:
  - text generation
  - HTTP text-to-speech
  - image generation
- capability contracts for browser, speech, vision, workspace, providers and embeddings
- `ai-sdk`-backed vision gateway for multimodal analysis without provider-specific runtime code
- model resilience adapters for retry, timeout and fallback outside the core loop
- explicit step-model middleware composition for hosts and adapters
- browser session recording wrapper for debugging and replay-oriented tooling
- runtime dispatch bus for fan-out routing across multiple runtimes
- filesystem-backed browser session recording
- avatar recording wrappers for expression, animation and movement traces
- speech synthesis recording wrappers and filesystem persistence
- blob-persisting wrappers for batch TTS, streaming TTS, STT and image generation
- workspace command recording wrappers and filesystem persistence
- in-memory BM25, vector, hybrid retrieval, provider gateway, skill registry and usage meter implementations
- filesystem-backed skill registry for durable skill loading in real products
- provider gateway composition for shared headers, defaults and fallback routing
- provider model-id normalization and configured browser/workspace/media defaults
- runtime host composition with injectable journal and note stores
- test coverage for the main runtime loop

This is intentionally still a small slice.
It is not yet a full memory architecture, persistence layer, retrieval stack, or autonomy framework.
Those should be added incrementally only after the current center remains clean.

## Documents

- [Architecture Overview](./docs/architecture-overview.md)
- [Core Responsibilities](./docs/core-responsibilities.md)
- [Execution Model](./docs/execution-model.md)
- [Plugin And Extension Model](./docs/plugin-and-extension-model.md)
- [Module Layout](./docs/module-layout.md)
- [Implementation Roadmap](./docs/implementation-roadmap.md)
- [Applications And Use Cases](./docs/applications-and-use-cases.md)
- [Implemented API](./docs/implemented-api.md)
- [Runtime Flow](./docs/runtime-flow.md)
- [Architecture Decisions](./docs/architecture-decisions.md)
- [Style And Boundaries](./docs/style-and-boundaries.md)
- [Getting Started](./docs/getting-started.md)

## Entrypoints

The package is now split into explicit layers:

- `agent-runtime-core`
  - the non-opinionated base layer
  - runtime, step contracts, strategies, plugins, observers, and core types
- `agent-runtime-core/integrations`
  - higher-level DX and integration utilities
  - adapters, gateways, persistence modules, memory modules, retrieval, scheduling, hosts, and integration helpers
- `agent-runtime-core/examples`
  - reference compositions that pressure-test the framework
  - more product-shaped examples such as autonomous agents, workspace agents, browser agents, VTuber-style shells, narrator flows, and NPC/world compositions

The root entrypoint is intentionally smaller now.
If you need practical integrations such as `AiSdkStepModelAdapter`, `createRuntimeHost`, `RuntimeVoiceSession`, configured gateways, memory modules, or persistence modules, import them from `agent-runtime-core/integrations`.

If you want to inspect or reuse the reference compositions, import them from `agent-runtime-core/examples`.

The runtime currently supports:

- dispatching abstract inputs
- assembling step context
- invoking a model adapter
- requesting and executing actions
- continuing across multiple steps
- configurable batching/selection of pending inputs per step
- configurable action execution strategy
- configurable formatting of inputs and action feedback into context entries
- configurable continuation resolution
- runtime lifecycle event streaming for host/UI/realtime integration
- message-level runtime output streaming for UI, TTS and realtime consumers
- step-level streaming through `streamStep()`
- multimodal step context with text and image parts
- chunk-level runtime message streaming for incremental speech/render pipelines
- multimodal runtime input formatting helpers for host-side dispatch
- generic event-to-runtime input bridges for callbacks, feeds and realtime sources
- reusable duplex voice wiring from realtime STT into runtime input and runtime message output back into TTS
- realtime text-to-speech sessions for incremental runtime output
- extension-based context contribution and lifecycle observation
- observer-based external monitoring without side effects inside plugins
- explicit reset of in-memory runtime state
- reusable recent-context and recall-oriented extensions
- reusable operational-memory and long-term-memory modules
- mutable per-runtime context notes outside the core
- optional journaling and historical replay support
- optional filesystem-backed persistence modules
- optional scheduled dispatch for delayed or recurring runtime input
- streamed and buffered voice integration surfaces for TTS/STT flows
- realtime TTS buffering on top of batch or streaming synthesis gateways
- blob-backed persistence wrappers for generated speech and images
- reusable helpers for extracting message/reasoning output from steps
- generic binary/media blob storage for audio, image and video artifacts
- model adapter hooks for before/after/error integration flows
- capability-layer contracts for media, browser, workspace, providers, embeddings and retrieval
- concrete in-memory implementations for BM25, vector search, hybrid retrieval, providers, skills and usage accounting

## Reference Examples

The repository still contains reference implementations under `src/examples`.

Those modules cover product families such as:

- autonomous agents
- VTuber-style shells
- workspace agents
- browser research agents
- story narrators
- NPC simulations

They are intentionally not exported from the package root.
They exist only to pressure-test the framework and preserve example compositions.

This is the first stable implementation layer to build on.

## Practical Validation

The repository now includes real MiniMax smoke scripts:

- `npm run validate:minimax`
- `npm run validate:examples`

Both expect `MINIMAX_API_KEY` in the environment.

The first validates:

- text generation through the runtime
- TTS synthesis
- image generation

The second validates the reference example compositions against a real MiniMax text model and real TTS where applicable.
