# Code Style

This document defines how code should be written in this repository.

The priority is not cleverness.
The priority is code that is easy to find, easy to read, and easy to change.

## What matters most

The main criteria are:
- concept
- responsibility / concern
- boundary
- readable flow

If code respects these four things, the rest becomes much easier.


## Guiding references

These references are useful, but they are not the primary source of truth.
The primary source of truth is what has already been agreed in this repository.
If there is any conflict, the repository rules and prior agreements win.

### Clean Code, adapted to this repository
Use Clean Code ideas where they help readability and separation of concerns.
But do not apply them mechanically.

What to keep from Clean Code:
- clear naming
- clear separation of concepts
- clear responsibilities and concerns
- consistent level of abstraction inside a flow
- code that is easy to read and reason about

What not to over-apply from Clean Code here:
- splitting everything into micro functions
- fragmenting the main flow just to make functions shorter
- forcing immutability everywhere when a contained mutable closure is the clearer design

In this repository, readability of the real flow matters more than chasing tiny functions.
A longer file can be better than a fragmented file if it keeps one concept coherent and readable.

### Ultra KISS / YAGNI
Prefer the simplest code that fits the current problem.
Do not build for possible future needs.
Do not add structure because it might be useful later.

That means:
- no speculative optimization
- no speculative safety layers
- no speculative abstractions
- no speculative extensibility work

If a real need appears later, solve that exact need then.

### DRY, but only when the repetition is real
Avoid real duplication.
But do not destroy readability just to deduplicate two short blocks.

In this repository, DRY is constrained by clarity.
If removing duplication makes the code harder to follow, the code got worse.

One strong practical rule that supports this is:
- if a file has a function in module scope, it should normally have only one top-level function

That rule pushes duplication pressure in a good direction:
- if code is truly reusable, move it into a concept that deserves its own file
- if code is not truly reusable, keep it local and direct

This helps avoid the common failure mode where DRY turns into a pile of generic helper functions with no clear owner.

## 1. Organize by concept
A file should exist because it owns a real concept in the system.

Examples of concepts:
- message store
- discord client
- wake queue
- contact book
- oauth store
- model provider

Examples of things that are not necessarily concepts by themselves:
- `save`
- `ingest`
- `normalize`
- `update`
- `parse`

Those are often actions inside a concept, not the concept itself.

Good:
- a `message-store` file that owns message persistence and message queries
- a `discord` file that owns Discord-specific inbound and outbound wiring
- a `wake-queue` file that owns wake scheduling

Bad:
- splitting one real concept into arbitrary verb files just because the code got long
- putting unrelated concepts together because they happen in the same flow

## 2. Separate responsibilities and concerns
Each part of the code should do one kind of job.

Examples:
- a store should persist and retrieve state
- a client adapter should handle external events and provider-specific transport
- a use case / entrypoint should orchestrate a flow
- a provider module should talk to the external provider

Do not make one part of the code own concerns from another layer.

Example:
- if Discord receives an inbound message, the Discord side can validate it, translate it, and call the internal code
- that does not mean the message store should understand Discord events

The problem is not that multiple steps exist.
The problem is when one module starts owning concerns that belong somewhere else.

## 3. Respect boundaries
Boundaries are where one part of the system hands off to another.

Typical boundaries:
- external input -> internal input
- provider-specific code -> generic runtime code
- app assembly -> reusable package code
- persistence -> orchestration

Code should make those handoffs visible.

Good:
- external input is parsed at the boundary
- provider-specific logic stays at the provider boundary
- stores do storage work
- use cases compose actions across concepts

Bad:
- external provider details leaking into generic storage code
- app-specific assembly mixed into reusable package code
- stores owning client/event logic

## 4. Keep flow local and readable
A reader should be able to follow the main path of the code from top to bottom.

Good flow:
1. validate input at the boundary
2. load or access the needed domain object
3. perform the action
4. persist if needed
5. return the result

Bad flow:
- bouncing through many tiny helpers for trivial things
- hiding the main path behind indirection
- forcing the reader to jump across many files to understand one simple action

## 5. One file, one main idea
A file should have one main idea.

That does not mean the file can only contain one method.
It means everything in the file should belong to the same concept.

Examples:
- a store file can expose multiple actions of that store
- a client file can contain the inbound and outbound behavior of that client
- a use-case file can coordinate several actions in one flow

What should be avoided:
- one file becoming a bag of helpers for unrelated concerns
- one file mixing provider logic, persistence logic, and app bootstrap logic

## 6. One top-level function in files that need one
If a file needs a top-level function, prefer one top-level function only.

That one function may expose actions for the concept it owns.

Examples:
- `createMessageStore()`
- `createWakeQueueRegistry()`
- `createDiscordAgentClient()`
- `resolveOpenAICodexCredential()`

Inner functions are fine when they belong directly to that concept.
What should be avoided is many unrelated top-level helpers in the same file.

## 7. Entry points / use cases are valid concepts
A file that orchestrates a flow can be correct if that orchestration is the real concern of the file.

This is valid:

```ts
async function ingestInboundMessage(rawInput: unknown) {
  const input = inboundMessageInputSchema.parse(rawInput);
  const account = await messageStore.findAccount(input.accountId);
  const contact = await messageStore.ensureContactFromInbound(input, account);
  const message = toStoredMessage(input, contact);
  await messageStore.saveMessage(message);
}
```

Why this can be correct:
- it is an entrypoint / use case
- it coordinates a flow
- it does not pretend to be a store
- it makes the sequence visible

What would be wrong is putting this same orchestration inside the store if the store is supposed to only own storage concerns.

## 8. Validate at boundaries
Validate unknown input where it enters the system.
Prefer Zod for this.

Good:
```ts
const input = inputSchema.parse(rawInput);
```

Bad:
```ts
if (!rawInput || typeof rawInput !== 'object') {
  throw new Error('Invalid input');
}
```
repeated in the middle of the codebase.

The middle of the flow should operate on already-valid data.

## 9. Avoid defensive programming in the middle of the flow
Do not build for hypothetical problems.
Do not add machinery because a problem might exist someday.

Examples of what to avoid unless there is a confirmed need:
- queues for possible contention
- retry logic for speculative failure paths
- extra caching without measured need
- normalization layers in the middle of business logic
- complicated fallback paths “just in case”

First write the code that matches the current reality.
If a real problem appears later, fix that exact problem.

## 10. Prefer `const`, use `let` only when the value really changes
`const` is the default.
Use `let` only when mutation is part of the design.

Good:
```ts
const account = state.accounts.find(...);
```

Also good when mutation is real:
```ts
let currentState: State | null = null;
```
if the object is intentionally lazily loaded and then retained by the store instance.

Bad:
- using `let` by habit
- mutating values without need
- carrying mutable variables farther than necessary

## 11. Prefer early returns over nested conditionals
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
    // real work
  }
}
```

## 12. Do not fight TypeScript
TypeScript should reflect the design, not be overridden to accept a bad design.

Avoid:
- `any`
- local redefinitions of library types just to make things compile
- casts used as a design escape hatch
- workarounds that hide a structural problem

If types are hard to express, first ask:
- is this file doing too much?
- is this concept mixed with another one?
- is the boundary unclear?
- is the API shape wrong?

If the answer is yes, fix the design first.
If the typing problem is still real after that, stop and discuss it instead of forcing a workaround.

## 13. Do not add abstraction for its own sake
Abstraction is not bad by itself.
It is only bad when it makes concepts, responsibilities, or boundaries less clear.

Good abstraction:
- makes ownership clearer
- reduces real duplication
- keeps the main flow readable
- matches a real concept in the system

Bad abstraction:
- exists only to be generic
- hides where the work really happens
- makes navigation harder
- mixes concerns instead of separating them

## 14. Use closures and factories only when they match the concept
Closures are useful when a runtime object owns state.
Factories are useful when an object is being created.
But they should not be used by default.

Good:
- a store closure that owns in-memory state
- a wake-queue registry that owns queue instances
- a client creator that wires one client instance

Bad:
- a factory just to wrap one direct call
- a closure that exists only to hide simple data flow

## 15. Reusable package code vs app assembly
Reusable package code should stay reusable.
Application assembly should stay in the app.

Good:
- reusable runtime pieces in `packages/mastra-engine`
- concrete bootstrapping in `apps/...`

Bad:
- app-specific assembly mixed into reusable runtime code

## 16. State ownership should be explicit
If something is a store, it should clearly own its state.

If a store keeps state in memory, then:
- it should load once when needed
- operate on its in-memory state
- persist after mutation

What should be avoided:
- reloading the file every time even though the store already owns the state
- introducing queues or locks before there is a confirmed need

## 17. Use examples carefully
Examples in documentation should illustrate real boundaries and real responsibilities.
They should not accidentally teach the wrong architecture.

If the concept is a store, the example should show store behavior.
If the concept is a use case, the example should show orchestration.
If the concept is a provider client, the example should show provider-specific handling.

## Practical test
Before keeping a piece of code, ask:
- what concept does this file own?
- what responsibility does this code have?
- what boundary is being crossed here?
- can I follow the flow top to bottom without hunting through the codebase?
- is this complexity solving a real problem, or a hypothetical one?

If those answers are not clear, the code probably needs to be reorganized.
