# Communication Module

## Purpose

This document defines the target rebuild of the communication module.

The architectural center is:

- the runtime created by `createAgent`
- the communication module owned by that runtime
- providers plugged into that runtime as transport adapters

The communication module:

- defines the contracts
- owns the orchestration
- owns the communication store
- exposes the tools the agent uses

Providers:

- implement transport
- expose platform-specific identity
- receive outbound send requests
- emit inbound communication events

Providers do not own the flow.
Providers do not register themselves.
Providers do not own the communication store.


## Main rule

The flow must be:

```text
createAgent
  -> creates communication runtime
    -> registers providers
      -> provider emits inbound events into communication
      -> communication persists and wakes agent
      -> agent uses communication tools
      -> communication calls provider for outbound transport
```

Not:

```text
provider
  -> registers itself
  -> owns wake
  -> owns communication flow
  -> owns message history
```


## Main concepts

### 1. Agent runtime

`createForgeAgent` and `createAgent` are the runtime constructors (with `createForgeAgent` being a convenience that enables long-term memory).

They:

- ✅ create the Mastra agent
- ✅ create the communication module for that agent
- ✅ create the wake queue for that agent
- ✅ register the providers passed in the config
- ✅ install the communication tools automatically via `createExternalAccountTools(communication)`

The app composes the runtime.
The runtime owns communication.

### 2. Communication module

The communication module owns:

- provider contracts
- provider registration inside the runtime
- the store of conversations and messages
- contact resolution
- inbound orchestration
- outbound orchestration
- agent-facing tools
- wake triggering after inbound work arrives

The communication module does not own provider SDK clients.

### 3. Provider

A provider is only a transport adapter.

Examples:

- Discord
- internal chat

A provider should know:

- how to identify its own external account
- how to subscribe to inbound events from that transport
- how to send outbound messages in that transport
- how to expose provider-specific conversation/message identifiers

A provider should not know:

- agentId
- accountId
- wake queue
- communication store internals
- contact book internals

### 4. Contact

A contact is who the agent can talk to.

A contact owns:

- slug
- display name
- description
- provider identities for that contact

The agent never creates contact accounts manually.
The communication module manages that.

### 5. Conversation

A conversation is explicit in the store.

A conversation owns:

- internal `conversationId`
- provider id
- external `providerConversationKey`
- optional name/title
- timestamps
- optional participant information

A conversation is created automatically when inbound arrives for a conversation that does not exist yet.

### 6. Message

A message is explicit in the store.

A message owns:

- internal `messageId`
- `conversationId`
- external `providerMessageId`
- direction
- author identity
- content
- attachments
- metadata
- read/unread state
- timestamps

The agent only sees and uses internal ids.
The communication module translates them to provider ids when talking to providers.


## Storage model

There is one communication store per agent.

That store belongs to the communication module.
It is not split by provider.

The store contains:

- `conversations`
- `messages`

Both exist explicitly.

Conversation read models may still be recomputed from messages when useful, but the conversation entity itself exists and is persisted.

All ids in this store are internal.
Provider ids are stored as external references.

### Internal ids

Use internal ids for:

- `conversationId`
- `messageId`

### External references

Store separately:

- `providerConversationKey`
- `providerMessageId`

This keeps the store owned by the system instead of by the provider.


## Conversation and message identity

Providers supply the provider-side keys.

### Inbound from provider

The provider emits something conceptually like:

- `provider`
- `providerConversationKey`
- `providerMessageId`
- `authorExternalId?`
- `authorDisplayName?`
- `authorUsername?`
- `content`
- `attachments`
- `createdAt`

The communication module:

- resolves or creates the internal conversation
- creates the internal message
- syncs the inbound contact identity when applicable
- marks the message unread
- triggers wake

### Outbound to provider

The communication module calls the provider with one of two destination modes:

- `contactExternalId`
- `providerConversationKey`

And optionally:

- `replyToProviderMessageId`

The provider then sends through its transport and returns provider-side ids.
The communication module persists the outbound message in the same store.


## Contact vs conversation

Keep these concepts separate.

### Contact

Represents a person or agent.

Useful for:

- direct messaging
- identity resolution

### Conversation

Represents a place/context where messages happen.

Useful for:

- group/channel history
- threads
- DMs already opened
- internal chat routes

This distinction matters because:

- group conversations may not have a contact target
- inbound group messages still have an author
- direct messaging needs a contact identity even without a conversation yet


## Tool-facing model

The agent should work with:

- provider
- contact slug
- internal conversation id
- internal message id

Not with:

- provider message ids
- provider conversation keys
- SDK objects
- transport-specific account ids

### Sending by contact

If the agent sends with:

- `contactSlug`

The communication module resolves the contact to a provider identity and asks the provider to open or use a direct conversation.

### Sending by conversation

If the agent sends with:

- internal `conversationId`

The communication module resolves that to the provider conversation key and sends in that context.

### Replying

If the agent replies with:

- internal `messageId`

The communication module resolves that to the provider message id and sends the reply using the provider.


## Suggested provider contract

A provider should expose something conceptually like:

- `id`
- `getAccount()`
- `start({ onInbound })`
- `sendMessage(...)`

The provider may also expose additional lookup helpers when needed, but the communication module owns the high-level flow.

### `getAccount()`

Returns provider-side account identity for the agent.

### `start({ onInbound })`

Starts subscription to inbound events and calls `onInbound(...)` with provider event data.

### `sendMessage(...)`

Sends outbound through the transport.
The provider receives provider-side destination references, not internal communication store ids.


## Suggested communication flow

### Inbound

```text
provider event
  -> communication.onInbound(...)
    -> resolve/create conversation
    -> create message
    -> sync contact identity
    -> mark unread
    -> wake agent
```

### Outbound

```text
agent tool call
  -> communication.sendMessage(...)
    -> resolve contact or conversation
    -> resolve provider-side destination ids
    -> call provider.sendMessage(...)
    -> persist outbound message
```

### Read/list

```text
agent tool call
  -> communication.listConversations()
  -> communication.getMessages()
```

The communication module reads from its own store.
It does not ask the provider for history.


## Internal chat preset

`internal-chat` is a framework preset.

It should be implemented as a provider factory/preset that plugs into the communication runtime like any other provider.

It is not a special orchestration path.
It is just another transport implementation owned by the framework.

It should use the framework storage layer, but communication still owns the communication model.


## Discord app

Discord is not part of the framework.

It belongs in the app.

The app creates the Discord provider and passes it into `createAgent`.
The framework should not export a Discord adapter as part of its core.


## Implementation direction

Rebuild in this order:

1. communication store per agent
2. conversation and message entities with internal ids
3. communication module reading/writing that store
4. provider contract reduced to transport
5. communication tools bound to the per-agent runtime
6. createAgent composing communication + wake + providers internally
7. app providers and framework presets adapted to the new contract

This is the simple center:

```text
runtime
  -> communication module
    -> communication store
    -> providers
```

That should be the new base.

---

## Implementation Status

**Status:** ✅ FULLY IMPLEMENTED

All concepts above have been realized in the codebase:

### Runtime (`createAgent` / `createForgeAgent`)
- **File:** `packages/mastra-engine/src/create-forge-agent.ts`
- Creates and wires: communication module, wake queue, memory, tools
- `createForgeAgent` enables long-term memory via `longTermMemory: true` option

### Communication Module
- **File:** `packages/mastra-engine/src/agent/communication/module.ts`
- Owns orchestration, provider registration, inbound/outbound flow
- Exposes: `onReceiveMessage`, `listContacts`, `getContact`, `sendMessage`, `listConversations`, `getMessages`

### Communication Store
- **File:** `packages/mastra-engine/src/agent/communication/store.ts`
- LibSQL-based (5 tables: accounts, contacts, contact_accounts, conversations, messages)
- Handles internal ID generation and provider ID mapping
- Supports conversation and message read/unread state tracking

### Provider Types
- **File:** `packages/mastra-engine/src/agent/communication/provider-types.ts`
- `CommunicationProvider` interface: minimal transport adapter contract
- `getAccount()`, `onMessage()`, `syncContacts()`, `sendMessage()` methods
- No provider owns flow, store, or wake logic

### Wake Queue
- **File:** `packages/mastra-engine/src/agent/wake-queue.ts`
- Debounce: 1000ms
- Max delay: 10000ms
- Triggers `agent.generate()` with "Pending external activity" prompt

### Communication Tools
- **File:** `packages/mastra-engine/src/agent/communication/tools.ts`
- Auto-registered via `createExternalAccountTools(communication)`
- Agent-facing tools use internal IDs, communication module translates to provider IDs

The architecture matches the spec above: runtime owns communication, communication owns store, providers are transport-only.
