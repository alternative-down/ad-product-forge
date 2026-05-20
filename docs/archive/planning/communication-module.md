# Communication Module Reference

## Overview

The communication module is the central orchestration layer for all external messaging integrations. It:

- Owns the communication store (conversations, messages, contacts)
- Manages provider registration and lifecycle
- Handles inbound message reception and storage
- Exposes agent-facing tools for sending and listing conversations
- Triggers wake events when external messages arrive

**Architecture principle:** The runtime owns communication; communication owns the store; providers are transport-only.

```text
createAgent
  ├─ creates communication module
  │  ├─ communication store (5 tables: accounts, contacts, contact_accounts, conversations, messages)
  │  ├─ provider registry
  │  ├─ inbound/outbound orchestration
  │  ├─ agent-facing tools (sendMessage, listConversations, etc.)
  │  └─ wake queue integration
  │
  └─ registers providers
     ├─ providers register inbound callbacks
     ├─ providers handle transport only
     └─ communication manages flow and storage
```

## Core Concepts

### 1. Runtime Creation

`createAgent()` and `createForgeAgent()` are the entry points for creating a communication-enabled runtime.

Located in: `packages/mastra-engine/src/create-forge-agent.ts`

**Responsibilities:**

- Create the Mastra `Agent` instance
- Initialize the communication module
- Register configured providers
- Auto-install communication tools via `createExternalAccountTools(communication)`
- Create the wake queue and wire it to the communication module
- Optionally enable long-term memory for `createForgeAgent()`

The runtime is the owner; all subcomponents are created and managed by it.

### 2. Communication Module

Located in: `packages/mastra-engine/src/agent/communication/module.ts`

**Owns:**

- Provider registration and lifecycle
- Communication store (5 LibSQL tables)
- Inbound message reception, validation, and persistence
- Outbound message routing and persistence
- Contact and conversation management
- Conversation history retrieval
- Wake event emission to the wake queue

**Does not own:**

- Provider SDK clients or credentials
- Provider transport implementation
- Agent flow or wake logic

### 3. Provider Contract

A provider is a transport-only adapter.

**Provider interface** (`packages/mastra-engine/src/agent/communication/provider-types.ts`):

```typescript
type CommunicationProvider = {
  id: string; // Unique provider identifier (e.g., "discord", "internal-chat")

  getAccount(): Promise<{
    externalAccountId: string;
    displayName?: string;
    metadata?: Record<string, unknown>;
  }>;

  onMessage?(callback: (message: CommunicationInboundMessage) => Promise<void>): void;

  syncContacts?(): Promise<
    Array<{
      slug: string;
      displayName: string;
      externalUserId?: string;
      username?: string;
    }>
  >;

  sendMessage(input: {
    providerConversationKey?: string;
    contactExternalId?: string;
    content: string;
    replyToProviderMessageId?: string;
  }): Promise<{
    providerConversationKey: string;
    providerMessageId?: string;
    conversationName?: string;
  }>;
};
```

**Provider responsibilities:**

- Know how to identify its external account
- Subscribe to inbound events and call the callback
- Send outbound messages via its transport
- Expose provider-specific conversation and message IDs

**Provider does not:**

- Own the communication flow
- Manage contacts or conversations in the store
- Trigger wake events
- Know about agentId or internal IDs

### 4. Contact

A contact represents a person or agent that the agent can communicate with.

**Contact entity:**

- `slug` — unique identifier (auto-generated or user-defined)
- `displayName` — human-readable name
- `description` — optional notes
- `accounts` — list of provider identities (externalUserId, username per provider)

**Lifecycle:**

- Contacts are created automatically when inbound messages arrive with new author identities
- Can be manually created via `communication.upsertContact()`
- The communication module manages all contact creation; the agent does not directly create contacts

### 5. Conversation

A conversation is a place where messages happen (DM, group chat, channel, etc.).

**Conversation entity:**

- `conversationId` — internal UUID
- `provider` — which provider owns this conversation
- `providerConversationKey` — external conversation identifier
- `name` — optional conversation title
- `contactSlug` — optional linked contact (for DMs)
- `createdAt`, `updatedAt` — timestamps

**Lifecycle:**

- Created automatically when inbound messages arrive for a new conversation
- Persisted explicitly in the store (not computed)
- Identified by `(provider, providerConversationKey)` combination

### 6. Message

A message is a single unit of communication.

**Message entity:**

- `messageId` — internal UUID
- `conversationId` — which conversation it belongs to
- `provider` — which provider
- `providerMessageId` — external message identifier
- `content` — message text
- `attachments` — array of attachment objects
- `authorExternalId`, `authorDisplayName`, `authorUsername` — sender identity
- `unread` — boolean
- `createdAt` — timestamp
- `metadata` — provider-specific data

**Key principle:** Agents only use internal IDs (`messageId`, `conversationId`). The communication module translates them to provider IDs when communicating with providers.

## Communication Store

Located in: `packages/mastra-engine/src/agent/communication/store.ts`

**One store per agent** — All communication for an agent is centralized in a single LibSQL database, not split by provider.

**Storage schema** (5 tables):

| Table                                  | Purpose                    | Key Fields                                             |
| -------------------------------------- | -------------------------- | ------------------------------------------------------ |
| `forge_communication_accounts`         | Provider accounts          | account_id, provider, external_account_id              |
| `forge_communication_contacts`         | Contacts                   | slug, display_name, description                        |
| `forge_communication_contact_accounts` | Contact → Provider mapping | slug, provider, external_user_id, username             |
| `forge_communication_conversations`    | Conversations              | conversation_id, provider, provider_conversation_key   |
| `forge_communication_messages`         | Messages                   | message_id, conversation_id, provider, content, unread |

**ID strategy:**

- **Internal IDs** — Used throughout the system (agents only see these)
  - `conversationId` — UUID, unique per agent
  - `messageId` — UUID, unique per agent

- **External references** — Stored separately, never exposed to agents
  - `providerConversationKey` — Provider-specific conversation ID
  - `providerMessageId` — Provider-specific message ID

This design keeps the store system-owned and provider-agnostic.

## Message Flow

### Inbound Flow

**Provider event → Communication store:**

```
Provider.onMessage(callback)
  ↓
Communication.onReceiveMessage()
  ├─ syncInboundContact() — resolve/create contact from author identity
  ├─ store.saveInboundMessage()
  │  ├─ resolve/create conversation by (provider, providerConversationKey)
  │  ├─ create message with internal IDs
  │  ├─ mark unread
  │  └─ persist to store
  ├─ receiveMessageHandler() — trigger wake queue
  └─ Agent wakes and processes pending activity
```

**Provider data structure:**

```typescript
type CommunicationInboundMessage = {
  providerConversationKey: string;
  providerMessageId: string;
  conversationName?: string;
  authorExternalId?: string;
  authorDisplayName?: string;
  authorUsername?: string;
  content: string;
  attachments?: Attachment[];
  createdAt: string;
  metadata?: Record<string, unknown>;
};
```

### Outbound Flow

**Agent tool → Provider transport:**

```
Agent.sendMessage({ provider, conversationId|contactSlug, content })
  ↓
Communication.sendMessage()
  ├─ Resolve internal IDs to provider IDs:
  │  ├─ if conversationId: get providerConversationKey
  │  ├─ if contactSlug: get contactExternalId from provider contacts
  │  └─ if replyToMessageId: get providerMessageId
  ├─ Provider.sendMessage(providerDestination)
  │  └─ Provider sends via transport, returns provider-side IDs
  ├─ store.saveOutboundMessage()
  │  └─ Persist with internal IDs
  └─ Return success with internal messageId and conversationId
```

**Agent-facing tool signature:**

```typescript
sendMessage({
  provider: string;
  conversationId?: string;    // OR contactSlug, not both
  contactSlug?: string;
  content: string;
  replyToMessageId?: string;  // internal ID
}): Promise<{ messageId, conversationId }>
```

## Agent-Facing API

Located in: `packages/mastra-engine/src/agent/communication/tools.ts`

The communication module exposes these tools to the agent:

```typescript
// List contacts
listContacts(): Promise<Array<{
  slug: string;
  displayName: string;
  description?: string;
}>>

// Get a single contact
getContact(slug: string): Promise<{
  slug: string;
  displayName: string;
  description?: string;
}>

// Create or update a contact
upsertContact(input: {
  slug: string;
  displayName: string;
  description?: string;
}): Promise<Contact>

// List conversations (with messages)
listConversations(input: {
  provider?: string;
  contactSlug?: string;
  unread?: boolean;
  limit: number;
}): Promise<Array<{
  conversationId: string;
  provider: string;
  latestMessageAt: string;
  unreadCount: number;
  name?: string;
  contactSlug?: string;
  contactDisplayName?: string;
  messages: MessageView[];
}>>

// Get messages in a conversation
getMessages(input: {
  conversationId: string;
  limit: number;
}): Promise<MessageView[]>

// Send a message
sendMessage(input: {
  provider: string;
  conversationId?: string;    // OR contactSlug
  contactSlug?: string;
  content: string;
  replyToMessageId?: string;
}): Promise<{
  success: boolean;
  messageId: string;
  conversationId: string;
}>
```

**Key principle:** All agent-facing tools use internal IDs only (conversationId, messageId, contactSlug). The communication module handles all translations to provider IDs internally.

## Implementation Notes

### Wake Queue Integration

When inbound messages arrive, the communication module calls the registered handler:

```typescript
communication.onReceiveMessage(wakeQueue.notifyExternalEvent);
```

Located in: `packages/mastra-engine/src/agent/wake-queue.ts`

- Debounce: 1000ms
- Max delay: 10000ms
- Triggers: `agent.generate()` with "Pending external activity detected.\n\nCheck your messages, inspect what is pending, and process what matters." prompt
- Wake events are batched to avoid redundant generations

### Provider Implementation

Providers are responsible for:

1. Implementing the `CommunicationProvider` interface
2. Calling the inbound callback when messages arrive
3. Handling send via their transport
4. Returning provider-specific IDs after sends

The communication module handles everything else: persistence, orchestration, contact resolution, wake events.

### Store Consistency

All provider operations are immediately persisted:

- Inbound messages → stored unread, wakes the agent
- Outbound messages → stored after successful send
- Contacts → created or updated on sync
- Conversations → auto-created on first inbound message
