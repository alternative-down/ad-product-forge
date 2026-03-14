# Communication Module

## Purpose

This document defines how the communication module should be built.

The goal is a simple module that is easy to read, easy to evolve, and easy to reason about.

This is not a description of the current code.
This is the target design for rebuilding the communication module from a simpler center.


## Main idea

The communication module exists for one reason:

- let an agent receive messages
- let an agent read pending conversations
- let an agent send messages

Everything else is secondary.

That means the center of the design should not be:
- adapters
- clients
- registries
- queues
- helper layers

The center should be:

- conversations
- messages
- contacts
- channels


## Core concepts

The module should be organized around four concepts.

### 1. Inbox

The inbox is the internal record of what the agent has received.

It should answer:
- what conversations exist?
- what messages belong to each conversation?
- what is unread?
- what was already sent?

The inbox is not transport.
The inbox is not provider logic.
The inbox is not wake logic.

It is the internal communication state of the agent.

### 2. Contacts

A contact is who the agent talks to.

It should answer:
- who is this person or agent?
- what is their slug?
- what identities do they have in each provider?

A contact is not a message.
A contact is not a conversation.

### 3. Channels

A channel is where a message is sent or received.

Examples:
- a Discord channel
- a Discord DM channel
- an internal chat direct thread between two agents

The important point is:
- contacts are people or agents
- channels are places or paths of communication

These are different concepts and should stay different.

### 4. Providers

A provider is the external or internal transport.

Examples:
- Discord
- internal chat

A provider should only handle:
- how to receive a message from that provider
- how to send a message through that provider

It should not own inbox logic.
It should not own contact logic.


## Boundaries

The module should have three boundaries.

### 1. Provider boundary

This is where an external or internal provider enters the system.

Examples:
- a Discord message event
- an internal chat send operation

At this boundary:
- provider-specific data is still provider-specific
- validation and translation happen here

The result should be a simple internal command.

### 2. Communication domain boundary

This is where provider input becomes inbox/contact/channel state.

This is the core of the module.

Here the system should reason in terms of:
- conversation
- message
- contact
- channel

Not in terms of Discord SDK objects.

### 3. Agent tools boundary

This is how the agent interacts with communication.

The agent should not know transport details.
The agent should work with:
- contacts
- conversations
- messages
- sending


## Desired architecture

The module should be rebuilt from a small center.

### The center

One module should own communication state and behavior.

That center should expose actions like:
- receive message
- list conversations
- get messages
- send message
- get contact
- upsert contact

These actions are the public language of the communication module.

### Around the center

Providers should be thin.

Discord should do:
- receive Discord event
- translate it
- call communication module

Internal chat should do:
- receive internal send
- translate it
- call communication module

That means providers become adapters around the communication module, not parallel systems.


## Suggested module shape

This is the simplest target shape.

```text
communication/
  inbox.ts
  contacts.ts
  channels.ts
  send-message.ts
  receive-message.ts
  tools.ts

accounts/
  discord.ts
  internal-chat.ts
```

This does not mean every file must exist exactly like this.
It means the concepts should be this clear.

If a simpler shape is possible, use the simpler shape.

For example:

```text
communication/
  inbox.ts
  contacts.ts
  send.ts
  receive.ts
  tools.ts
```

would also be valid if it stays clear.


## Data flow

### Inbound flow

This should be the flow for any provider.

1. provider receives an external event
2. provider validates and translates it
3. provider calls `receiveMessage(...)`
4. communication module:
   - resolves or creates the contact
   - resolves the conversation/channel
   - stores the inbound message
   - marks it unread
5. provider or app triggers wake

Important:
- wake is not part of communication state
- wake is a runtime effect after communication state changes

### Outbound flow

This should be the flow for any provider.

1. agent calls `send_message`
2. communication module resolves:
   - provider
   - target contact or channel
   - reply context if any
3. communication module calls the provider adapter
4. provider sends the real message
5. communication module stores the outbound message

Important:
- storing outbound is the job of the communication module
- provider should only transport the message


## What should not exist in the core

These are the patterns to avoid in the redesign.

### 1. State plus transport mixed together

The inbox should not know how to call Discord.

### 2. Contact logic mixed into message persistence by accident

Contact resolution can happen during receive/send flows, but contacts remain their own concept.

### 3. A generic runtime registry as the center of the architecture

The center should be a communication model, not a dispatch table.

Runtime lookup structures may still exist internally if needed, but they should not define the architecture.

### 4. Provider-specific terms leaking into the whole module

The communication module should not become “Discord-shaped”.


## Internal chat

Internal chat should follow the same design as any other provider.

It is just another transport.

That means:
- it should not have a special parallel architecture
- it should not bypass the communication module
- it should go through the same receive/send entrypoints

The only difference is:
- its transport target is another agent inside the system


## Discord

Discord should be treated as a transport adapter.

It should do only what is specific to Discord:
- login and client lifecycle
- listen to Discord events
- translate Discord message data
- send messages through Discord API

It should not own:
- unread logic
- conversation state
- contact state


## Contacts and channels

These two things should stay separate.

### Contact

A contact is:
- Nicolas
- Forge Helper
- another agent

### Channel

A channel is:
- Discord channel id
- Discord DM channel id
- internal direct thread id

A message belongs to a channel.
A conversation is built around a channel or a direct contact path.

Do not collapse these two concepts into one generic field.


## Minimal first version

The rebuild should start from the smallest useful version.

### Step 1

Build only these capabilities:
- receive inbound message
- list conversations
- get messages from one conversation
- send outbound message

Ignore advanced features at first.

### Step 2

Add contacts:
- slug
- display name
- provider identities

### Step 3

Add internal chat on the same flow as Discord.

### Step 4

Add richer behaviors only if needed:
- scheduled self messages
- channel aliases
- groups
- message formatting helpers


## Evolution rules

When evolving the module:

- start from the smallest valid model
- keep one central communication flow
- add features only after the simpler path is solid
- do not add registries, caches, queues, or abstractions unless a real problem is confirmed


## Practical design rules

### The communication module should read like a system, not like plumbing

A reader should be able to answer:
- where inbound enters
- where state changes
- where outbound happens
- where wake is triggered

without jumping through many files.

### Tools should describe the communication domain, not transport internals

Good tool language:
- list conversations
- get messages
- get contact
- send message

Bad tool language:
- transport registry
- account dispatch
- provider sender lookup

Those may exist internally, but they are not the agent-facing model.


## Questions to settle before implementation

Before rebuilding the module, these decisions should be explicit.

### 1. What defines a conversation?

Possible answer:
- provider + channel

But this must be decided clearly.

### 2. When sending by contact, how is the channel chosen?

Possible answer:
- use DM for Discord
- use direct route for internal chat

This must be explicit.

### 3. Where does wake belong?

Recommended answer:
- outside communication state
- triggered after successful inbound persistence

### 4. Does the communication core call providers directly, or does the app wire transports into it?

This should be decided once and kept consistent.


## Recommended implementation order

1. define the internal communication model
2. define inbound command shape
3. define outbound command shape
4. implement inbox/conversation persistence
5. implement contact persistence
6. wire Discord to the inbound/outbound commands
7. wire internal chat to the same inbound/outbound commands
8. expose agent tools on top of that


## Final target

At the end, the communication module should feel like this:

- one clear center
- thin providers around it
- agent-facing tools that reflect the domain
- transport details kept at the edge
- no architecture built around workaround layers

The module should be explainable in a few sentences:

"Providers translate inbound and outbound messages.
The communication core stores conversations, messages, contacts, and channels.
The agent reads and sends through tools.
Wake happens after inbound persistence."
