# Communication Module

## Purpose

This document defines how the communication module should be rebuilt.

The main correction is this:

- the communication module defines the contracts
- the communication module orchestrates the flow
- providers implement those contracts
- providers do not own the flow

That is the architectural center.

The previous direction was confusing because the flow was provider-driven:
- Discord received an event
- Discord decided what happened next
- internal chat did the same

That makes the system feel inverted and scattered.

The target architecture is:
- the agent registers providers when it is created
- the communication module receives those registered providers
- the communication module calls them through its own contracts
- the communication module decides the flow
- providers only implement transport concerns and provider-local state


## What the communication module is

The communication module is the part of the system that coordinates how an agent communicates.

It should answer:
- what providers are available to this agent?
- how does the agent receive communication from them?
- how does the agent send communication through them?
- what tools does the agent use to interact with communication?

It should not become:
- a Discord module
- a state persistence module
- a message storage module
- a read/unread tracking module

Those things may exist in the system, but they are not the center of communication.


## Main architecture rule

The flow must be:

```text
agent
  -> communication module
    -> provider
```

And for inbound:

```text
provider
  -> communication module callback / entrypoint
    -> agent wake or agent-facing effect
```

Not:

```text
provider
  -> provider-specific orchestration
    -> state
    -> contacts
    -> wake
    -> tools
```

The provider should not be the conductor.


## Core concepts

The module should be built around these concepts.

### 1. Communication module

This is the orchestrator and contract owner.

It owns:
- provider contracts
- registration of providers for an agent
- inbound entrypoints
- outbound entrypoints
- agent-facing tools
- routing by provider/contact/channel

It does not own provider state.

### 2. Provider

A provider is a transport adapter.

Examples:
- Discord
- internal chat

A provider should only know:
- how to subscribe to inbound events
- how to send outbound messages
- how to deal with its own transport-specific state

Examples of provider-local state:
- saved messages for that provider
- unread/read tracking for that provider
- cursors
- channel ids
- platform-specific ids

That state belongs to the provider adapter, not to the communication module.

### 3. Contact

A contact is who the agent talks to.

Examples:
- Nicolas
- Forge Helper
- another internal agent

A contact should answer:
- who is this?
- what is the slug?
- what identities does this contact have in each provider?

### 4. Channel or route

A channel is where communication happens.

Examples:
- a Discord channel
- a Discord DM
- an internal direct route between two agents

This is different from contact.


## Boundaries

The module should have clear boundaries.

### Provider boundary

This is where raw provider events and raw provider send operations exist.

Examples:
- Discord SDK message object
- internal chat transport send callback

This boundary is provider-specific.

### Communication boundary

This is where the system stops talking about SDK objects and starts talking about communication actions.

Examples:
- receive message from provider
- send message through provider
- list available contacts
- resolve provider route for a contact

### Agent tools boundary

This is how the agent sees the communication module.

The agent should work with:
- provider
- contact
- channel
- conversation
- message

It should not have to care about transport internals beyond what is truly necessary.


## What belongs to the provider

This part is important.

The following responsibilities should stay with the provider adapter:

- provider client lifecycle
- provider event subscription
- provider-specific ids
- provider-specific local message persistence, if needed
- read/unread marking, if needed
- channel/thread/dm resolution
- actual send/reply calls

This means:
- saving messages is not the job of the communication module
- marking messages as read is not the job of the communication module

Those are adapter concerns.


## What belongs to the communication module

The communication module should own:

- the provider contracts
- provider registration for the agent
- a unified API for inbound and outbound actions
- contact resolution
- routing decisions
- agent-facing tools
- wake triggering after inbound handling

In other words:
- providers do transport
- communication does orchestration


## Provider registration

Providers should be registered when the agent is built.

That means the agent should end up with something like:

- Discord provider registered
- internal chat provider registered

Then the communication module uses those registered providers through its own contracts.

This is better because:
- the communication module becomes the center
- the app still chooses what providers exist
- each provider becomes a dependency, not the conductor


## Suggested shape

The module should start from a small center.

A simple target shape would be:

```text
communication/
  module.ts
  contacts.ts
  tools.ts

providers/
  discord.ts
  internal-chat.ts
```

This is intentionally small.

The point is:
- communication has a visible center
- providers are around it

If later we need more files, split only by real concept.


## Communication module API

The communication module should expose a small public language.

Examples:
- registerProvider(...)
- receiveInbound(...)
- sendOutbound(...)
- listContacts(...)
- getContact(...)
- upsertContact(...)

Maybe later:
- listConversations(...)
- getMessages(...)

But these should only exist if they still belong to the communication module and not to provider-local state.


## Inbound flow

This should be the inbound flow.

1. provider is registered by the communication module
2. communication module subscribes to provider inbound events through the provider contract
3. provider emits an inbound event to the communication module
4. communication module:
   - identifies the provider
   - resolves contact information
   - decides what agent-facing effect should happen
   - triggers wake

If the provider wants to persist its own local message state:
- it does that inside the provider adapter

That persistence is not the communication module’s job.


## Outbound flow

This should be the outbound flow.

1. agent calls a communication tool
2. communication module resolves:
   - which provider to use
   - which contact or channel to use
   - whether this is a direct send or a reply
3. communication module calls the chosen provider through the provider contract
4. provider performs the real send
5. provider records its own local message state if needed

Again:
- communication coordinates
- provider transports


## Internal chat

Internal chat should follow exactly the same architecture.

It is not a special subsystem.
It is only another provider.

That means:
- it gets registered into the communication module
- communication uses it like any other provider
- it emits inbound events like any other provider
- it sends outbound messages like any other provider

The difference is only transport target:
- another agent instead of an external platform user


## Discord

Discord should be just a provider adapter.

It should own:
- Discord client setup
- Discord event listener
- Discord send/reply logic
- Discord local state if needed

It should not own the communication flow.


## Contacts

Contacts still belong to the communication module.

That is because contact identity is part of the agent’s communication model, not part of the transport.

A contact should map identities across providers.

Example:
- slug: `nicolas`
- Discord identity
- maybe later email identity
- maybe later another provider identity


## Conversations and messages

This needs an explicit decision before rebuilding.

The current thinking should be:

- communication should not own raw provider message persistence
- communication may still expose conversation-level operations to the agent

That means we need to decide one of two models:

### Option A

Communication owns high-level conversations and asks providers for underlying message state.

### Option B

Providers own both raw messages and conversation state, and communication only orchestrates them.

This must be decided before coding.

Right now, based on the latest direction, the safer assumption is:

- provider owns message persistence and unread/read state
- communication orchestrates access to that state


## Minimal first version

The rebuild should start with the smallest valid slice.

### Step 1

Implement the provider contract.

Each provider should support the contract defined by the communication module.

Minimum likely contract:
- subscribe to inbound
- send outbound

Optionally:
- provider-local message listing
- provider-local read state

### Step 2

Implement communication module provider registration.

It should:
- register providers for an agent
- receive inbound callbacks from them
- call them for outbound

### Step 3

Implement contacts in the communication module.

### Step 4

Expose agent tools on top of the communication module.

### Step 5

Only after the above is solid, decide where conversation/message listing belongs.


## What should be avoided

### 1. Provider-driven orchestration

Bad:
- provider receives event
- provider decides domain flow
- provider directly coordinates state, contacts, wake, and response behavior

### 2. Communication pretending to be storage for everything

Bad:
- communication owns every message table
- communication owns unread/read flags
- communication owns provider-local persistence

### 3. Generic runtime plumbing becoming the architecture

Bad:
- registries, dispatch tables, and glue code becoming the main design

These things may exist internally.
They should not define the mental model of the system.


## Questions to settle before implementation

### 1. What exact provider contract should exist?

Minimum likely answer:
- `onMessage(handler)`
- `sendMessage(command)`

### 2. Does communication ask providers for conversations/messages?

This is still open and should be decided before coding.

### 3. What is the minimal agent-facing tool set?

Likely:
- list contacts
- get contact
- send message

Conversation/message reading may come later depending on the chosen model.

### 4. Where exactly does wake happen?

Recommended answer:
- after communication receives a valid inbound event
- not inside provider transport logic


## Final target

The final system should be explainable like this:

"Providers are registered into the communication module.
The communication module defines the provider contracts and orchestrates inbound and outbound flow for the agent.
Providers only implement transport and provider-local state.
Contacts live in the communication module.
Wake happens after communication handles inbound events."
