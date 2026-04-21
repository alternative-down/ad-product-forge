# Getting Started

## Purpose

This document shows the smallest useful way to use the library as it exists today.

The goal is not to show every extension.
The goal is to make the first successful usage obvious.

## Smallest Runtime

At minimum you need:

- an `AgentRuntime`
- a `StepModelAdapter`

The runtime itself does not require:

- storage
- memory
- scheduling
- a profile model

That is deliberate.

## Entrypoints

Use the package in layers:

- `agent-runtime-core`
  - runtime base, contracts, strategies, plugins, observers, core types
- `agent-runtime-core/integrations`
  - adapters, gateways, persistence, memory, retrieval, hosts, and other DX helpers
- `agent-runtime-core/examples`
  - reference compositions and product-shaped example scaffolds

## Basic Example

```ts
import { AgentRuntime } from 'agent-runtime-core';
import { AiSdkStepModelAdapter } from 'agent-runtime-core/integrations';
import { openai } from '@ai-sdk/openai';

const runtime = new AgentRuntime({
  runtimeId: 'assistant-1',
  model: new AiSdkStepModelAdapter({
    model: openai('gpt-5-mini'),
  }),
});

await runtime.dispatch({
  id: 'input-1',
  type: 'event',
  payload: {
    text: 'Say hello briefly.',
  },
});

const result = await runtime.run();
```

## Adding Actions

```ts
import { z } from 'zod';

runtime.registerAction({
  name: 'sum',
  description: 'Add two numbers',
  inputSchema: z.object({
    left: z.number(),
    right: z.number(),
  }),
  execute(input) {
    return input.left + input.right;
  },
});
```

Now the model can request that action through the runtime adapter contract.

## Adding Context Extensions

```ts
import {
  createStaticContextPlugin,
  createRecentStepsPlugin,
} from 'agent-runtime-core/integrations';

runtime.use(createStaticContextPlugin({
  entries: [{
    id: 'global',
    kind: 'instruction',
    title: 'Global Instruction',
    text: 'Stay concise and explicit.',
  }],
}));

runtime.use(createRecentStepsPlugin({
  maxSteps: 2,
}));
```

## Adding Mutable Notes

```ts
import {
  InMemoryContextNoteStore,
  createContextNotesPlugin,
} from 'agent-runtime-core/integrations';

const notes = new InMemoryContextNoteStore();

await notes.set('assistant-1', {
  id: 'goal',
  title: 'Current Goal',
  text: 'Help the player run the shop well.',
});

runtime.use(createContextNotesPlugin({
  store: notes,
}));
```

## Adding Journaling

```ts
import {
  InMemoryRuntimeJournal,
  createRuntimeJournalPlugin,
  createJournalHistoryPlugin,
} from 'agent-runtime-core/integrations';

const journal = new InMemoryRuntimeJournal();

runtime.use(createRuntimeJournalPlugin({
  journal,
}));

runtime.use(createJournalHistoryPlugin({
  journal,
  maxSteps: 3,
}));
```

This gives you:

- recorded inputs
- recorded steps
- later historical replay into context

without making journaling mandatory for all runtimes.

## Adding Scheduling

```ts
import { InMemoryRuntimeScheduler } from 'agent-runtime-core/integrations';

const scheduler = new InMemoryRuntimeScheduler();

scheduler.scheduleInput({
  target: runtime,
  delayMs: 1000,
  input: {
    id: 'timer-1',
    type: 'tick',
    payload: { value: 'tick' },
  },
});
```

This is intentionally outside `AgentRuntime`.

## Adding Workspace Execution

```ts
import { LocalBashWorkspaceGateway } from 'agent-runtime-core/integrations';

const workspace = new LocalBashWorkspaceGateway();

const result = await workspace.execute({
  command: 'printf hello',
});
```

This is the current concrete "just bash" workspace implementation.

## Adding Usage Metering

```ts
import {
  InMemoryUsageMeter,
  createUsageMeterPlugin,
} from 'agent-runtime-core/integrations';

const meter = new InMemoryUsageMeter();

runtime.use(createUsageMeterPlugin({
  meter,
}));
```

If the model adapter provides usage metadata, the meter will receive per-step usage records.

## Guidance

The current best way to use the library is:

1. start with the runtime only
2. add actions
3. add one extension at a time
4. add journaling only when you need it
5. add scheduling only when you need it

Do not try to enable everything at once before the runtime surface you need is clear.
