# Implemented API

## Purpose

This document records the concrete public surface that already exists in the repository.

The architecture documents describe where the repository is going.
This document describes what is already real.

It should be kept aligned with the implementation so that:

- future work starts from the actual code, not only from intentions
- later refactors can see which surfaces are already public
- example applications know what they can rely on

## Public Exports

The public surface is now split into explicit entrypoints.

### Root Entry (`agent-runtime-core`)

The root export is the non-opinionated base layer from `src/core-entry.ts`.

It contains:

- `AgentRuntime`
- core runtime contracts and types
- multimodal step-context helpers
- action, plugin, and observer registries
- batching, continuation, context formatting, and action-execution strategies
- `AsyncEventChannel`
- `RuntimeEventStream`
- step output helpers
- `runtimeSnapshotSchema`

### Integration Entry (`agent-runtime-core/integrations`)

The integration export is the broader DX layer from `src/integrations-entry.ts`.

It contains the practical modules that sit above the core, including:

- model adapters and model middleware
- hosts
- runtime input, message, speech, and realtime bridges
- chunk-level runtime streaming integrations
- memory, retrieval, journal, persistence, and usage modules
- browser, workspace, provider, speech, vision, image, avatar, and blob gateways
- configured and persisting gateway wrappers
- scheduling and dispatch helpers
- testing adapters

### Example Entry (`agent-runtime-core/examples`)

The examples export is the reference-composition layer from `src/examples/index.ts`.

It contains:

- example applications such as autonomous, workspace, browser, VTuber, narrator, and NPC/world compositions
- example orchestration helpers
- example domain stores and gateways

## AgentRuntime

`AgentRuntime` is the central execution object.

Its current responsibilities are:

- receive inputs
- hold pending inputs in memory
- assemble step context
- invoke a model adapter
- execute requested actions
- update runtime state
- continue across steps when instructed
- expose snapshot state

### Constructor

Current shape:

```ts
new AgentRuntime({
  runtimeId?: string,
  model: StepModelAdapter,
})
```

This is intentionally small.
The runtime currently depends only on:

- an identifier, optionally provided
- a model adapter

It does not require:

- storage
- memory subsystem
- scheduler
- chat thread
- role or profile

It now also separates two extension surfaces:

- plugins, which can contribute context and perform lifecycle side effects
- observers, which can watch runtime lifecycle without owning behavior

### Methods

#### `registerAction`

Registers a typed action.

```ts
runtime.registerAction({
  name: 'sum',
  description: 'Add two numbers',
  inputSchema: z.object({
    left: z.number(),
    right: z.number(),
  }),
  execute(input, context) {
    return input.left + input.right;
  },
});
```

The input is validated at the boundary using Zod.

#### `use`

Registers a runtime plugin.

```ts
runtime.use(createRecentStepsPlugin());
```

Plugins are how optional behaviors enter the runtime without contaminating the core.

#### `observe`

Registers an observer for monitoring and host-side telemetry.

```ts
runtime.observe({
  name: 'ui-observer',
  onStatusChanged(context) {
    console.log(context.status);
  },
});
```

Observers are intended for:

- UI integration
- logging
- metrics
- host orchestration

They are not meant to mutate runtime behavior.

#### `dispatch`

Adds input to the runtime.

```ts
await runtime.dispatch({
  id: 'event-1',
  type: 'event',
  payload: { text: 'hello' },
});
```

This does not automatically execute a step.
It only adds input into the pending queue.

#### `step`

Executes one step if there is pending input or if the runtime is already in continuation mode.

```ts
const result = await runtime.step();
```

Returns either:

- `null` when there is nothing to do
- `StepExecutionResult` when a step ran

#### `streamStep`

Executes one step through a streaming-capable model adapter when available.

```ts
const stream = await runtime.streamStep();
```

Returns either:

- `null` when there is nothing to do
- `RuntimeStepStream` when a step was started

`RuntimeStepStream` exposes:

- `events`
  - incremental `segment-delta`
  - `action-request`
  - `action-results`
  - `step-complete`
  - `error`
- `completion`
  - resolves to the final `StepExecutionResult`

When the model adapter does not implement streaming, the runtime falls back to a normal step and exposes the completed result through the same stream surface.

#### `run`

Runs multiple steps until:

- there is nothing to do
- continuation stops
- or `maxSteps` is reached

```ts
const result = await runtime.run({ maxSteps: 10 });
```

This is the simplest way to let the runtime consume its pending work.

#### `getSnapshot`

Returns in-memory runtime state:

- runtime id
- status
- pending inputs
- last action results
- completed steps

This is currently the main introspection surface.

## StepModelAdapter

This interface is intentionally small.

```ts
interface StepModelAdapter {
  generateStep(request: StepModelRequest): Promise<StepModelResponse>;
}

interface StreamingStepModelAdapter extends StepModelAdapter {
  streamStep(request: StepModelRequest): Promise<StepModelStream>;
}
```

The runtime does not care how the adapter internally reaches a provider.
That is the adapter's concern.

This allows:

- `ai-sdk`
- local models
- custom provider wrappers
- deterministic fake models for tests

to coexist under the same runtime contract.

## Step Context

The step-context surface now supports multimodal parts.

Each `StepContextEntry` may contain:

- text parts
- image parts

The helper surface includes:

- `createTextStepContextEntry(...)`
- `createImageStepContextEntry(...)`
- `getStepContextParts(...)`
- `getStepContextText(...)`

This keeps text-only code simple while allowing multimodal adapters to pass image data through the runtime without inventing provider-specific context formats.

## Streaming Integrations

The repository now includes integration-level streaming helpers above the runtime core.

These include:

- `RuntimeMessageStream`
  - emits full step message output after a step completes
- `RuntimeMessageChunkStream`
  - emits incremental message chunks from `RuntimeStepStream`
- `createMultimodalContextFormatter(...)`
  - maps multimodal runtime inputs directly into multimodal step context entries
- `createMultimodalRuntimeInputPayload(...)`
  - constructs validated multimodal runtime payloads for host-side dispatch
- `RuntimeVoiceSession`
  - bridges runtime message output into batch or streaming TTS after full step completion
- `RuntimeStreamingVoiceSession`
  - bridges incremental runtime message chunks into realtime TTS sessions

## Memory Surface

The repository now includes two optional memory modules.

### Operational Memory

Operational memory is meant to cover recent raw execution material plus synthesized observations.

The current in-memory implementation supports:

- appending raw entries
- reserving a recent raw band by unit budget
- moving overflow into observed summaries
- rendering observations and recent raw back into runtime context

This is intentionally still a small operational-memory layer.
It is not yet a full reflection/checkpoint architecture.

### Long-Term Memory

Long-term memory is currently represented as:

- a document store surface
- a recall surface
- an in-memory implementation built on the repository's BM25 and vector primitives
- a filesystem-backed implementation that persists documents and serves hybrid recall

This is enough to support:

- durable document storage
- hybrid recall
- runtime recall plugins

without forcing any one product-specific memory pipeline.

## Reference Implementations

The repository still includes reference compositions under `src/examples`.

Those modules exist to:

- pressure-test the framework against real product families
- validate satellite integrations in practice
- preserve example compositions for autonomous agents, workspace agents, browser agents, narrators, VTuber shells and NPC simulations

They are intentionally not exported from `src/index.ts`.
They are not part of the framework contract.

## Skill Loading

The repository now includes a filesystem skill loader that can:

- scan directories recursively for `SKILL.md`
- derive skill ids from directory names
- derive names and descriptions from the markdown content
- register discovered skills into any `SkillRegistry`

This closes an important gap between abstract skill contracts and real product workspaces.

## Provider Gateway Composition

Provider gateway support now includes small composition utilities:

- `ConfiguredProviderGateway` for shared headers and default configuration
- `FallbackProviderGateway` for provider fallback without pushing retry logic into the runtime core

This keeps provider policy outside the step runtime while still making real product composition easier.

## Realtime Speech

Two more practical capability-layer pieces now exist:

- `BufferedRealtimeSpeechToTextGateway`, which adapts a batch STT gateway into a simple realtime session model
- `BufferedStreamingTextToSpeechGateway`, which adapts a batch TTS gateway into a stream-friendly interface
- `RuntimeEventStream`, which exposes runtime lifecycle as a subscribe/async-iterator bridge
- `RuntimeMessageStream`, which filters runtime events down to message-bearing step outputs
- `RealtimeSpeechRuntimeBridge`, which dispatches realtime transcription events into runtime inputs
- `RuntimeInputBridge`, which maps arbitrary external events into runtime inputs for callbacks, feeds and realtime sources

This remains a generic capability-layer building block and does not introduce product-domain architecture into the framework center.

## Model Hooks

The repository now also includes `HookedStepModelAdapter`.

That wrapper keeps common integration needs out of the runtime center:

- `beforeGenerate`
- `afterGenerate`
- `onError`

This is useful when a host needs request-scoped callbacks without wrapping model logic in application code each time.

## Blob Storage

The repository now also includes generic blob storage primitives for media outputs such as:

- audio
- images
- video
- arbitrary generated artifacts

Current implementations include:

- `InMemoryBlobStore`
- `FilesystemBlobStore`

## Vision and Workspace Skill Loading

The repository now also includes:

- `AiSdkVisionGateway`, which routes multimodal image analysis through `generateText`
- direct filesystem skill loading support inside the workspace agent scaffold

That means the library now has a cleaner path for:

- provider-agnostic vision analysis
- workspace agents that can bootstrap notes from skill folders without a separate preload step

## Model Resilience and Browser Recording

The repository now also includes:

- retry wrappers for step models
- timeout wrappers for step models
- fallback wrappers for step models
- a browser recording wrapper and in-memory session recorder

These additions keep operational resilience and debugging support outside the runtime core while still making them reusable across products.

## Dispatch Bus and Persistent Browser Recording

The repository now also includes:

- `RuntimeDispatchBus` for fan-out input routing into many runtimes
- `FilesystemBrowserSessionRecorder` for durable browser session traces

This is useful for:

- multi-agent or multi-runtime orchestration
- debugging browser-driven agents across process restarts
- separating routing concerns from the runtime loop itself

## Avatar and Speech Recording

The repository now also includes:

- avatar recording wrappers for expression, animation and movement
- speech synthesis recording wrappers
- filesystem persistence for speech synthesis event trails

This gives embodied products a cleaner way to retain and inspect presentation-layer behavior without coupling those traces to the runtime core.

## Workspace Command Recording

The repository now also includes:

- `RecordingWorkspaceGateway`
- `InMemoryWorkspaceCommandRecorder`
- `FilesystemWorkspaceCommandRecorder`

This fills the same observability gap for workspace and shell-driven agents that browser, avatar, and speech recording already covered.

## Keyed Scheduling and Usage Persistence

The repository now also includes:

- a runtime target registry for runtime lookup by id
- a keyed scheduler that dispatches into runtimes through that registry
- a filesystem-backed usage meter

This is useful for:

- orchestrating many runtimes from a shared host
- scheduling work without keeping direct runtime references everywhere
- persisting compute/accounting data beyond process lifetime

## RuntimeActionDefinition

Actions are registered as typed units with:

- name
- description
- input schema
- execute function

They are intentionally defined as runtime-facing building blocks rather than provider-facing tool definitions.

That distinction matters.
The runtime owns action orchestration.
Any particular model adapter only decides how action opportunities are presented to the model.

## RuntimePlugin

Plugins are the main extension mechanism.

Current hooks:

- `onDispatch`
- `provideContext`
- `onAfterModel`
- `onAfterActions`
- `onAfterStep`

This is enough to support the first wave of extensions without bloating the center.

### Important Limitation

Plugins currently work entirely in memory and synchronously with the runtime lifecycle.

That is acceptable for the current implementation slice, but later more advanced needs may require:

- richer extension state
- stronger hook contracts
- more deliberate mutation surfaces
- isolation of plugin-private state

Those are future design questions, not current defects.

## Runtime Snapshot Persistence

The runtime now exposes an explicit snapshot restore path and a reusable snapshot schema.

This supports:

- host restart and resume
- filesystem-backed runtime snapshot persistence
- validation of restored runtime state at the boundary

The runtime intentionally restores into an idle state rather than pretending it can resume a half-finished in-flight step.

The host layer now also supports:

- wiring a `RuntimeSnapshotStore`
- restoring snapshots through the host surface
- observing completed steps and persisting snapshots automatically

## Filesystem Operational Memory

Operational memory no longer exists only as an in-memory demo surface.

The repository now includes a filesystem-backed operational memory implementation that:

- persists raw entries
- persists observations
- recomputes recent-versus-overflow bands on read
- can be reused across host restarts

## Built-In Extensions

### `createRecentStepsPlugin`

Adds recent step output back into future context.

This is a very small but useful example of:

- context reuse
- memory-like behavior implemented outside the core

### `createStaticContextPlugin`

Adds static or lazily generated context entries.

This is useful for:

- instructions
- environmental framing
- host-provided operating notes

without forcing those concepts into the runtime itself.

### `createInMemoryRecallPlugin`

Provides a generic recall pattern:

- build a query from runtime context
- retrieve documents from a host-supplied source
- inject the unseen results into the next step context
- keep a dedupe window in memory

This is intentionally generic.
It is not yet a full long-term memory subsystem.
But it is an important proof that recall can live as an extension rather than a core feature.

## InMemoryRuntimeScheduler

This utility is outside the core runtime and intentionally optional.

It currently supports:

- delayed input dispatch
- recurring input dispatch
- optional auto-run after dispatch
- cancellation

This begins to cover re-entry and autonomy patterns without forcing scheduling into the center of `AgentRuntime`.

## Testing Surface

`FakeStepModelAdapter` exists specifically to make the runtime testable without a real provider.

This is important because the runtime's health should not depend on live model calls during every validation pass.

## Current Stability Judgment

The current surface is strong enough to be considered a real first layer.

It is not final.
But it is no longer a placeholder.

Future additions should preserve this discipline:

- keep the center small
- add capability through extensions or utilities first
- only promote concepts into the center when several real use cases prove they belong there
