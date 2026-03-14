# Code Style

This document defines how code should be written in this repository.

The goal is not academic purity.
The goal is code that is easy to read, easy to change, and easy to trust.

## Core principles

### 1. Prefer simple code over defensive code
Do not preemptively build machinery for problems that have not been observed.

Do not add:
- queues to avoid possible future contention
- caches to solve performance that was not measured
- retry systems for hypothetical failures
- normalization layers because input might maybe be wrong
- wrapper abstractions just to make code look generic

Write the direct version first.
If a real problem appears, fix that exact problem with a targeted change.

### 2. Optimize for readability first
A reader should be able to open a file and understand the flow from top to bottom.

Prefer:
- direct names
- direct data flow
- short jumps between concepts
- local reasoning

Avoid:
- indirect control flow
- too many helper functions
- fragmented logic spread across many tiny files without reason
- abstractions that hide the real work

### 3. Each file should own one concept
A file should represent one main responsibility.

Good examples:
- one file for message state persistence
- one file for Discord account wiring
- one file for contact registration
- one file for one tool

Bad examples:
- one file mixing file I/O, contact logic, message listing, sender routing, and provider-specific reply rules
- one file that is just a pile of unrelated helpers

The concept should be the real concept of the system, not just a verb.

Good:
- a message store file that owns message persistence and message queries
- a Discord account file that owns Discord wiring
- a wake queue file that owns wake scheduling

Bad:
- a file called `message-ingest` if ingestion is not actually a primary domain concept
- splitting one store into `message-ingest`, `message-read`, and `message-write` just because those are verbs

### 4. Prefer linear code
Code should read in the same order that the runtime behaves.

Good:
1. parse input
2. load state
3. find account
4. perform action
5. persist result
6. return response

Bad:
- jump into helper A
- helper A calls helper B
- helper B normalizes helper C output
- helper C reads hidden module state

### 5. Use early returns
Prefer exiting early over nesting branches.

Good:
```ts
if (!account) {
  throw new Error(`Account not found: ${accountId}`);
}

if (alreadyExists) {
  return;
}
```

Bad:
```ts
if (account) {
  if (!alreadyExists) {
    // actual work
  }
}
```

### 6. Validate at the boundary
When input comes from the outside, validate it at the boundary with Zod.
Do not spread manual type checks through the middle of the flow.

Good:
```ts
const inputSchema = z.object({
  slug: z.string(),
  limit: z.number().int().positive().default(20),
});

const input = inputSchema.parse(rawInput);
```

Bad:
```ts
if (!rawInput || typeof rawInput !== 'object') {
  throw new Error('Invalid input');
}

const slug = typeof rawInput.slug === 'string' ? rawInput.slug : '';
const limit = typeof rawInput.limit === 'number' ? rawInput.limit : 20;
```

### 7. Do not fight TypeScript
TypeScript is not the enemy.
If the type system is hard to satisfy, the design is often the problem.

Do not:
- cast away type errors as a workaround
- redefine library signatures locally
- build local type facades to silence inference problems
- use `any`

Instead:
- simplify the module
- split a large file
- reduce generic coupling
- give values explicit shapes where the boundary is real

If a library typing becomes a real blocker and the right solution is not obvious, stop and discuss before forcing it.

### 8. Avoid module-scope mutable state
Do not keep mutable runtime state in module scope unless there is a very strong reason.

Bad:
```ts
const queue = new Map();
let currentState = {};
```

If state must live across calls, prefer to contain it inside a single explicit runtime object.

Good:
```ts
export function createWakeQueueRegistry() {
  const queues = new Map();
  return { ... };
}
```

Or, when simpler:
- load once lazily into a local closure
- mutate in memory
- write back directly

### 9. Use closures sparingly
Closures are useful for local state, but they are not a default style.
Use them when they make ownership obvious.
Avoid them when plain direct functions are clearer.

### 10. Avoid builders and factories unless they are actually buying clarity
Do not introduce builders just because configuration is large.
A direct function call is often clearer.

Bad:
```ts
const tool = createCustomToolBuilder()
  .withName('send_message')
  .withSchema(schema)
  .withHandler(handler)
  .build();
```

Good:
```ts
export function createSendMessageTool(agentId: string) {
  return createTool({
    id: 'send_message',
    inputSchema,
    execute: async (input) => {
      return messageStore.sendAccountMessage({ ...input, agentId });
    },
  });
}
```

## File-level rules

## One top-level function per file
If a file needs a function at module scope, it should normally have one top-level function only.

That function can contain local inner helpers if they are tightly related to that one concept.

Good:
- `createMessageState()` in `message-state.ts`
- `createDiscordAgentClient()` in `discord.ts`
- `resolveOpenAICodexCredential()` in `openai-codex-auth.ts`

Bad:
- one file with five exported helpers and three internal helpers for unrelated concerns

### Keep constants with the concept they belong to
Constants are fine in module scope if they are part of the same concept.

Good:
```ts
const WAKE_DEBOUNCE_MS = 1000;
const WAKE_MAX_DELAY_MS = 10000;
```

### Prefer local variables over reusable micro-helpers
If logic is only used once, keep it inline unless extraction makes the file meaningfully easier to read.

Bad:
```ts
function normalizeChannelName(channel: Channel) {
  ...
}
```
when it is used exactly once and hides simple code.

## Tool design

### Use `createTool` directly
Do not wrap `createTool` in local compatibility layers.
Do not redefine the tool type system.

Good:
```ts
const inputSchema = z.object({ slug: z.string() });

export function createGetContactTool(agentId: string) {
  return createTool({
    id: 'get_contact',
    description: 'Get a contact by slug.',
    inputSchema,
    execute: async (input) => {
      return {
        contact: await messageStore.getAgentContact(agentId, input.slug),
      };
    },
  });
}
```

Bad:
```ts
const tool = createTool as unknown as CustomToolFactory;
```

### Put operational contract in the tool schema and description
If a rule is about how to call the tool, put it in the tool.
Do not duplicate the same contract in the system prompt.

Good:
- `replyToMessageId` description explains when to use it
- schema enforces `target` xor `contactSlug`

Bad:
- the tool enforces one rule
- the prompt re-explains another version of the same rule

## State and persistence

### Keep state handling obvious
When using file-backed state:
- load once lazily
- keep it in memory
- mutate it directly
- save after mutation

Do not build write queues or concurrency machinery unless a real, observed problem requires it.

Good:
```ts
function createMessageState() {
  let currentState: State | null = null;

  async function load() {
    if (!currentState) {
      currentState = await readStateFile();
    }

    return currentState;
  }

  async function update(handler: (state: State) => Promise<void> | void) {
    const state = await load();
    await handler(state);
    await save(state);
  }
}
```

Bad:
- loading from disk on every read without reason
- queueing writes to solve unconfirmed contention
- introducing locks before there is a demonstrated race

## Architecture rules

### The reusable package should stay reusable
`packages/mastra-engine` should contain reusable Mastra-based runtime pieces.
Application assembly should live in `apps/`.

### Separate storage from intake
Store is not the same thing as ingest.

Store is responsible for:
- reading state
- writing state
- querying state
- updating persisted domain data

Ingest or intake is responsible for:
- receiving external input
- validating it at the boundary
- translating it into domain operations
- calling the store or domain service underneath

Good:
- Discord receives a message
- Discord normalizes the inbound event
- Discord or an intake service calls the store with the data it needs to persist

Bad:
- the store is responsible for understanding Discord events
- the store owns external event normalization
- provider adapters and storage logic are mixed in the same concept

### Keep provider-specific behavior at the edge
Discord-specific behavior belongs in the Discord account module.
Internal-chat-specific behavior belongs in the internal-chat module.
Do not leak provider-specific rules into generic message code unless the generic code is explicitly routing provider behavior.

### Keep the core explicit
Core agent modules should be easy to follow:
- message state
- message store
- contact book
- account registry
- message delivery
- wake queue

## What to do when the code feels hard to type

If TypeScript becomes hard to satisfy:
1. check if the file has too many responsibilities
2. check if one function is doing too many things
3. check if a generic is leaking too far
4. check if a wrapper exists only to work around inference
5. simplify the design before changing the typing approach

If the problem is still real after simplifying, stop and discuss instead of forcing a workaround.

## What not to do

Do not do these things unless there is a confirmed reason:
- create generic helper layers for one call site
- create queues for possible concurrency
- normalize unknown shapes in the middle of the flow
- add casts to force the compiler to accept a design
- rewrite library types locally
- hide provider-specific behavior behind vague abstractions
- split one linear flow into many tiny helpers for style alone

## Preferred style examples

### Example: good direct flow
```ts
export function createMessageStore() {
  async function saveMessage(input: SaveMessageInput) {
    const state = await loadState();
    const alreadyExists = state.messages.some(
      (current) => current.accountId === input.accountId && current.messageId === input.messageId,
    );

    if (alreadyExists) {
      return;
    }

    state.messages.push({
      messageId: input.messageId,
      accountId: input.accountId,
      content: input.content,
      unread: input.unread,
      createdAt: input.createdAt,
    });

    await saveState(state);
  }

  async function listMessages(accountId: string) {
    const state = await loadState();
    return state.messages.filter((message) => message.accountId === accountId);
  }

  return { saveMessage, listMessages };
}
```

Why this is good:
- one file, one concept
- the concept is the store itself
- straight-line flow
- no defensive helper maze
- no speculative infrastructure

### Example: bad indirect flow
```ts
export function createMessageIngest() {
  async function ingestInboundMessage(rawInput: unknown) {
    const input = inboundMessageInputSchema.parse(rawInput);
    const account = await messageStore.findAccount(input.accountId);
    const contact = await messageStore.ensureContactFromInbound(input, account);
    const message = toStoredMessage(input, contact);
    await messageStore.saveMessage(message);
  }

  return { ingestInboundMessage };
}
```

Why this is bad:
- it pretends ingest is the main concept
- it spreads one message concept across fake sub-concepts
- it makes the store depend on a separate action layer without need
- it weakens the file boundary instead of clarifying it

## Final rule

When in doubt, choose the version that:
- is shorter
- is more literal
- is easier to read top to bottom
- makes fewer assumptions
- introduces fewer moving parts

If a future problem happens, fix that problem then.
Do not pre-pay complexity.
