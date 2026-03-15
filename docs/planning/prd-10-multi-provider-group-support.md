# PRD 10 — Multi-Provider Group Support

**Status:** Draft - Analysis & Planning
**Date:** 2026-03-15
**Version:** 0.1
**Feature ID:** prd-10

---

## 1. Executive Summary

**Objective:** Extend the agent communication system to support group-based messaging across all providers (Discord, Email), enabling agents to coordinate with multiple contacts simultaneously while maintaining provider-agnostic workflows.

**Value Proposition:**
- Agents can create and manage groups across all communication providers
- Distribute messages efficiently to multiple recipients (CC, BCC for email; channels/roles for Discord)
- Unified API for group operations across different transport mechanisms
- Maintain consistency in group membership and communication history

**Scope:**
- Discord: Channel creation, group messaging via channels, @mentions for group notifications
- Email: CC/BCC functionality, mailing list support, group message history
- Core: Group entity in communication store, agent-facing tools for group management and messaging

---

## 2. Problem Statement

### Current State
- Individual conversations are supported (1-to-1 messaging)
- Channels exist in Discord but are treated as single conversations without explicit group management
- Email provider lacks group support (CC/BCC not implemented)
- No unified interface for managing groups across providers
- Agents cannot programmatically create groups or manage memberships

### Pain Points
1. **Limited multi-recipient messaging** — Agents must send individual messages or use provider-specific APIs
2. **Inconsistent group semantics** — Discord channels are not explicitly "groups"; email lacks groups entirely
3. **No group lifecycle management** — Cannot create, update membership, or delete groups via agent tools
4. **Provider-specific workarounds** — Different logic for Discord (channels) vs. Email (CC/BCC)
5. **Historical context loss** — Group conversations are not properly tracked for future reference

### Impact Without Solution
- Reduced agent capability for coordination tasks
- Higher complexity for multi-recipient communication scenarios
- Fragmented group data across providers
- Inability to reuse groups across multiple messages

---

## 3. Goals and Non-Goals

### Goals
1. **✅ Create groups in Discord** — Agents can create channels and invite members
2. **✅ Create groups in Email** — Agents can compose messages to multiple recipients with CC/BCC and mailing lists
3. **✅ Manage group membership** — Add/remove members from groups
4. **✅ Send group messages** — Unified tool for sending messages to groups across all providers
5. **✅ Store group metadata** — Persist group definitions, members, and conversation history in communication store
6. **✅ Unified agent API** — Agents use a single interface for group operations, not provider-specific logic
7. **✅ Group message history** — Track conversation threads in groups consistently

### Non-Goals
1. **❌ Real-time group sync** — Membership changes are not synchronized across providers
2. **❌ Group permissions/roles** — Advanced role-based access control deferred to v2
3. **❌ Group settings UI** — Group management via REST API only (no web dashboard in v1)
4. **❌ Private/public group classification** — All groups are treated uniformly
5. **❌ Group webhooks** — External notifications for group events
6. **❌ Archive/restore groups** — Groups are permanent once created

---

## 4. User Stories and Use Cases

### User Story 1: Create a Discord Channel for Project Coordination
**As an:** Agent coordinating a project
**I want to:** Create a Discord channel and add team members
**So that:** The team can communicate asynchronously about project details

**Acceptance Criteria:**
- Agent calls `createGroup({ provider: 'discord', name: 'project-xyz', members: [...] })`
- Channel is created in Discord with specified name
- Initial members are invited to the channel
- Internal group record is created with all metadata

**Implementation Flow:**
```
Agent → createGroup()
  ↓
Communication.createGroup()
  ├─ Provider.createChannel() [Discord-specific]
  ├─ Store.saveGroup()
  ├─ Store.addGroupMembers()
  └─ Return groupId + metadata
```

### User Story 2: Send Email to Multiple Recipients with CC
**As an:** Agent sending project updates
**I want to:** Send an email to a group of recipients, some as To, some as CC
**So that:** All stakeholders are informed but email chains stay organized

**Acceptance Criteria:**
- Agent calls `sendMessage({ provider: 'email', groupId: 'xyz', content: '...' })`
- Email is sent to all primary members (To)
- CC members receive a copy but are not in main recipient list
- Email thread is linked to group conversation in store

**Implementation Flow:**
```
Agent → sendMessage({ groupId })
  ↓
Communication.sendMessage()
  ├─ Resolve groupId → group metadata (To, CC, BCC lists)
  ├─ Provider.sendMessage() with email composition
  │  └─ nodemailer: To=primary, CC=secondary, BCC=hidden
  ├─ Store.saveOutboundMessage()
  └─ Return messageId + conversationId
```

### User Story 3: Manage Group Membership
**As an:** Agent managing team communications
**I want to:** Add or remove members from an existing group
**So that:** The group stays synchronized with current team composition

**Acceptance Criteria:**
- Agent calls `updateGroup({ groupId, addMembers: [...], removeMembers: [...] })`
- Discord: Members added via channel invite/remove via channel removal
- Email: Group definition updated for future sends
- Store is updated with new membership list

**Implementation Flow:**
```
Agent → updateGroup()
  ↓
Communication.updateGroup()
  ├─ Fetch current group metadata
  ├─ Provider.updateMembers() [provider-specific]
  │  ├─ Discord: channel.members.add/remove
  │  └─ Email: update group definition
  ├─ Store.updateGroupMembers()
  └─ Return updated group metadata
```

### User Story 4: List and Retrieve Group Information
**As an:** Agent retrieving past communications
**I want to:** List all groups and view group member lists
**So that:** I can understand who was involved in previous conversations

**Acceptance Criteria:**
- Agent calls `listGroups()` or `getGroup(groupId)`
- Returns all groups with member lists and metadata
- Can filter by provider or by member

**Implementation Flow:**
```
Agent → listGroups()
  ↓
Communication.listGroups()
  └─ Store.getGroupsWithMembers()
     └─ Return [{groupId, name, provider, members[], createdAt}]
```

### Use Case: Multi-Provider Notification System
**Scenario:** Agent needs to notify all stakeholders of a critical update simultaneously across Discord and Email.

**Flow:**
1. Agent creates two groups: `discord-team` (Discord channel), `email-stakeholders` (email group)
2. Agent calls `sendMessage()` twice (once per group)
3. Both messages appear in agent's conversation history
4. Each provider handles transport independently

---

## 5. Feature Requirements

### 5.1 Core Data Model

#### Group Entity
```typescript
interface Group {
  groupId: string;                    // UUID, unique per agent
  provider: 'discord' | 'email';      // Which provider owns this group
  name: string;                       // Human-readable group name
  description?: string;               // Optional description

  // Provider-specific identifiers
  providerGroupKey?: string;          // e.g., Discord channel ID, email group identifier

  // Membership
  members: GroupMember[];             // List of members with roles
  createdAt: string;                  // ISO 8601
  updatedAt: string;                  // ISO 8601

  // Metadata
  metadata?: {
    [key: string]: unknown;           // Provider-specific data (e.g., channel settings)
  };
}

interface GroupMember {
  memberContactSlug: string;          // Reference to existing contact
  externalUserId?: string;            // Provider-specific ID
  username?: string;                  // Provider username

  // Email-specific fields
  emailRecipientType?: 'to' | 'cc' | 'bcc';  // How to include in email sends

  // Discord-specific fields
  discordRoleId?: string;             // Role within channel (future)

  joinedAt: string;                   // When member was added
}
```

#### Store Schema (New Tables)

**Table: `forge_communication_groups`**
```sql
CREATE TABLE forge_communication_groups (
  group_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  provider_group_key TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_groups_provider ON forge_communication_groups(provider);
```

**Table: `forge_communication_group_members`**
```sql
CREATE TABLE forge_communication_group_members (
  group_id TEXT NOT NULL,
  member_contact_slug TEXT NOT NULL,
  external_user_id TEXT,
  username TEXT,
  email_recipient_type TEXT,  -- 'to' | 'cc' | 'bcc'
  discord_role_id TEXT,
  joined_at TEXT NOT NULL,

  PRIMARY KEY (group_id, member_contact_slug),
  FOREIGN KEY (group_id) REFERENCES forge_communication_groups(group_id)
);

CREATE INDEX idx_group_members_contact ON forge_communication_group_members(member_contact_slug);
```

**Table: `forge_communication_group_conversations`**
```sql
CREATE TABLE forge_communication_group_conversations (
  group_conversation_id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,  -- Internal conversation ID
  created_at TEXT NOT NULL,

  FOREIGN KEY (group_id) REFERENCES forge_communication_groups(group_id),
  FOREIGN KEY (conversation_id) REFERENCES forge_communication_conversations(conversation_id)
);

CREATE INDEX idx_group_conv_group ON forge_communication_group_conversations(group_id);
```

### 5.2 Provider Enhancements

#### Discord Provider (`createDiscordProvider`)

**New Capabilities:**
- `createChannel()` — Create new Discord channel and return channelId
- `addChannelMembers()` — Invite users to channel
- `removeChannelMembers()` — Remove users from channel
- `getChannelMembers()` — List current members of a channel

**Contract Changes:**
```typescript
type DiscordProvider = CommunicationProvider & {
  // Existing
  sendMessage(input: {...}): Promise<{...}>;

  // New group-specific methods
  createChannel?(input: {
    name: string;
    description?: string;
  }): Promise<{
    providerGroupKey: string;    // Discord channel ID
    channelName: string;
  }>;

  addChannelMembers?(input: {
    channelId: string;
    userIds: string[];           // Discord user IDs
  }): Promise<{ success: boolean; addedCount: number }>;

  removeChannelMembers?(input: {
    channelId: string;
    userIds: string[];
  }): Promise<{ success: boolean; removedCount: number }>;

  getChannelMembers?(input: {
    channelId: string;
  }): Promise<Array<{ userId: string; username: string; displayName?: string }>>;
};
```

**Implementation Details:**
- Use Discord.js `guild.channels.create()` to create channels
- Use `channel.members.add()` and `channel.members.remove()` for membership
- Leverage channel type for group vs. direct messaging distinction

#### Email Provider (`createEmailProvider`)

**New Capabilities:**
- Support CC/BCC recipients in `sendMessage()`
- Maintain group definitions without server-side persistence (email groups exist only in agent logic)

**Contract Changes:**
```typescript
type EmailProvider = CommunicationProvider & {
  sendMessage(input: {
    providerConversationKey?: string;
    contactExternalId?: string;

    // New group-specific fields
    toAddresses?: string[];           // Primary To recipients
    ccAddresses?: string[];           // CC recipients
    bccAddresses?: string[];          // BCC recipients

    content: string;
    replyToProviderMessageId?: string;
  }): Promise<{
    providerMessageId: string;
    providerConversationKey: string;
    sentTo: string[];                 // All recipients
  }>;
};
```

**Implementation Details:**
- Extract CC/BCC from group metadata in Communication module
- Pass to `nodemailer` transport in SMTP send
- Email groups are purely virtual (no server-side mailing lists in v1)
- Group members are stored in store; emails are composed client-side

### 5.3 Communication Module Enhancements

**New Tools (exposed to agents):**

```typescript
// Create a group
createGroup(input: {
  provider: 'discord' | 'email';
  name: string;
  description?: string;
  members: Array<{
    contactSlug: string;
    emailRecipientType?: 'to' | 'cc' | 'bcc';  // Email only
  }>;
}): Promise<{
  groupId: string;
  providerGroupKey?: string;
  name: string;
  memberCount: number;
}>

// Get group details
getGroup(input: {
  groupId: string;
}): Promise<Group>

// List groups
listGroups(input: {
  provider?: string;
  limit?: number;
}): Promise<Group[]>

// Update group membership
updateGroup(input: {
  groupId: string;
  addMembers?: Array<{
    contactSlug: string;
    emailRecipientType?: 'to' | 'cc' | 'bcc';
  }>;
  removeMembers?: string[];  // contactSlugs to remove
}): Promise<{
  groupId: string;
  memberCount: number;
  addedCount: number;
  removedCount: number;
}>

// Delete a group
deleteGroup(input: {
  groupId: string;
}): Promise<{ success: boolean }>

// Send message to group (variant of existing sendMessage)
sendMessage(input: {
  provider: string;

  // One of the following:
  conversationId?: string;      // Existing conversation
  contactSlug?: string;         // Direct message to contact
  groupId?: string;             // Send to group

  content: string;
  replyToMessageId?: string;
}): Promise<{ success: boolean; messageId: string; conversationId: string }>
```

**Implementation in Communication Module:**

```typescript
// In packages/mastra-engine/src/agent/communication/module.ts

async createGroup(input: {
  provider: string;
  name: string;
  description?: string;
  members: Array<{ contactSlug: string; emailRecipientType?: string }>;
}) {
  // 1. Validate provider exists and supports groups
  const provider = providers.get(input.provider);
  if (!provider) throw new Error(`Unknown provider: ${input.provider}`);

  // 2. Resolve contact slugs to external IDs
  const resolvedMembers = await Promise.all(
    input.members.map(async (m) => {
      const contact = await store.getContact(m.contactSlug);
      const account = contact.accounts.find(a => a.provider === input.provider);
      return {
        contactSlug: m.contactSlug,
        externalUserId: account?.externalUserId,
        username: account?.username,
        emailRecipientType: m.emailRecipientType || 'to',
      };
    })
  );

  // 3. Call provider-specific group creation
  let providerGroupKey: string | undefined;
  if (input.provider === 'discord') {
    const result = await provider.createChannel?.({
      name: input.name,
      description: input.description,
    });
    providerGroupKey = result?.providerGroupKey;

    // Invite members
    if (provider.addChannelMembers && providerGroupKey) {
      await provider.addChannelMembers({
        channelId: providerGroupKey,
        userIds: resolvedMembers
          .filter(m => m.externalUserId)
          .map(m => m.externalUserId!),
      });
    }
  } else if (input.provider === 'email') {
    // Email groups are virtual; no server-side creation needed
  }

  // 4. Persist to store
  const groupId = crypto.randomUUID();
  await store.saveGroup({
    groupId,
    provider: input.provider,
    name: input.name,
    description: input.description,
    providerGroupKey,
    members: resolvedMembers,
  });

  return { groupId, providerGroupKey, name: input.name, memberCount: resolvedMembers.length };
}

async sendMessage(input: {
  provider: string;
  conversationId?: string;
  contactSlug?: string;
  groupId?: string;
  content: string;
  replyToMessageId?: string;
}) {
  // ... existing DM/conversation logic ...

  // NEW: Handle group sends
  if (input.groupId) {
    const group = await store.getGroup(input.groupId);
    const members = await store.getGroupMembers(input.groupId);

    if (input.provider === 'discord') {
      // Send to Discord channel via provider
      const result = await provider.sendMessage({
        providerConversationKey: group.providerGroupKey,
        content: input.content,
        replyToProviderMessageId: input.replyToMessageId
          ? (await store.getMessage(input.replyToMessageId)).providerMessageId
          : undefined,
      });

      // Store message
      const messageId = await store.saveOutboundMessage({
        conversationId: group.providerGroupKey,  // Channel ID as conversation
        provider: input.provider,
        providerMessageId: result.providerMessageId,
        content: input.content,
      });

      // Link message to group conversation
      await store.saveGroupConversation({
        groupId: input.groupId,
        conversationId: group.providerGroupKey,
      });

      return { success: true, messageId, conversationId: group.providerGroupKey };
    } else if (input.provider === 'email') {
      // Compose email to group members with CC/BCC
      const toAddresses = members
        .filter(m => m.emailRecipientType === 'to')
        .map(m => m.username);
      const ccAddresses = members
        .filter(m => m.emailRecipientType === 'cc')
        .map(m => m.username);
      const bccAddresses = members
        .filter(m => m.emailRecipientType === 'bcc')
        .map(m => m.username);

      const result = await provider.sendMessage({
        toAddresses,
        ccAddresses,
        bccAddresses,
        content: input.content,
        replyToProviderMessageId: input.replyToMessageId
          ? (await store.getMessage(input.replyToMessageId)).providerMessageId
          : undefined,
      });

      // Store message
      const messageId = await store.saveOutboundMessage({
        conversationId: group.providerGroupKey,
        provider: input.provider,
        providerMessageId: result.providerMessageId,
        content: input.content,
      });

      // Link message to group conversation
      await store.saveGroupConversation({
        groupId: input.groupId,
        conversationId: group.providerGroupKey,
      });

      return { success: true, messageId, conversationId: group.providerGroupKey };
    }
  }

  // ... existing logic for conversationId / contactSlug ...
}
```

### 5.4 Discord-Specific Implementation

**File:** `packages/mastra-engine/src/accounts/discord-groups.ts` (new)

```typescript
export async function createChannel(client: Client, input: {
  name: string;
  description?: string;
}): Promise<{ providerGroupKey: string; channelName: string }> {
  const guild = client.guilds.cache.first();  // Use first guild (or select based on config)
  if (!guild) throw new Error('No Discord guild found');

  const channel = await guild.channels.create({
    name: input.name,
    topic: input.description,
    type: ChannelType.GuildText,
  });

  return {
    providerGroupKey: channel.id,
    channelName: channel.name,
  };
}

export async function addChannelMembers(client: Client, input: {
  channelId: string;
  userIds: string[];
}): Promise<{ success: boolean; addedCount: number }> {
  const channel = await client.channels.fetch(input.channelId);
  if (!channel?.isTextBased()) throw new Error('Invalid channel');

  let addedCount = 0;
  for (const userId of input.userIds) {
    try {
      await channel.permissionOverwrites.create(userId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
      addedCount++;
    } catch (error) {
      console.error(`Failed to add user ${userId} to channel:`, error);
    }
  }

  return { success: true, addedCount };
}

export async function getChannelMembers(client: Client, channelId: string) {
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isMember?.()) throw new Error('Invalid channel');

  const members = await channel.members.fetch();
  return members
    .filter(m => !m.user.bot)
    .map(m => ({
      userId: m.id,
      username: m.user.username,
      displayName: m.displayName,
    }));
}
```

### 5.5 Email-Specific Implementation

**File:** `packages/mastra-engine/src/accounts/email-groups.ts` (new)

```typescript
// Email provider already supports CC/BCC via sendMessage()
// Groups are virtual (stored only in communication store, not on email server)

// When sending to an email group:
// 1. Resolve group members from store
// 2. Separate by emailRecipientType (to/cc/bcc)
// 3. Pass to nodemailer transport

export function composeFmailToGroup(input: {
  toAddresses: string[];
  ccAddresses?: string[];
  bccAddresses?: string[];
  content: string;
  subject?: string;
  replyTo?: string;
}) {
  return {
    to: input.toAddresses.join(', '),
    cc: input.ccAddresses?.join(', '),
    bcc: input.bccAddresses?.join(', '),
    subject: input.subject || 'Group Message',
    text: input.content,
    inReplyTo: input.replyTo,
  };
}
```

---

## 6. Technical Architecture

### 6.1 System Diagram

```
Agent
  ├─ createGroup({ provider, name, members })
  ├─ updateGroup({ groupId, addMembers, removeMembers })
  ├─ sendMessage({ groupId, content })
  └─ listGroups()
      ↓
Communication Module
  ├─ Resolve group metadata from store
  ├─ Translate group to provider-specific format
  │  ├─ Discord: channelId + member permissions
  │  └─ Email: recipient lists (To/CC/BCC)
  ├─ Route to provider
  │  ├─ Discord provider: channel operations
  │  └─ Email provider: SMTP composition
  └─ Persist to store (group + members + conversation links)
      ↓
Store (5 existing + 3 new tables)
  ├─ forge_communication_groups
  ├─ forge_communication_group_members
  └─ forge_communication_group_conversations
```

### 6.2 Data Flow Example: Discord Channel Creation

```
1. Agent calls: createGroup({
     provider: 'discord',
     name: 'project-alpha',
     members: [
       { contactSlug: 'alice' },
       { contactSlug: 'bob' }
     ]
   })

2. Communication module:
   a. Resolves contactSlugs → external Discord user IDs
      - alice → external_user_id: '123456'
      - bob → external_user_id: '234567'

   b. Calls provider.createChannel({ name: 'project-alpha' })
      - Discord.js creates #project-alpha channel
      - Returns channelId: '987654'

   c. Calls provider.addChannelMembers({
        channelId: '987654',
        userIds: ['123456', '234567']
      })
      - Sets channel permissions for both users

   d. Stores in database:
      forge_communication_groups:
        groupId: uuid-xxx
        provider: 'discord'
        name: 'project-alpha'
        provider_group_key: '987654'

      forge_communication_group_members:
        (uuid-xxx, alice, 123456, alice_username, to)
        (uuid-xxx, bob, 234567, bob_username, to)

3. Returns: { groupId, name, memberCount: 2 }
```

### 6.3 Data Flow Example: Email Group Message

```
1. Agent calls: sendMessage({
     provider: 'email',
     groupId: 'group-email-001',
     content: 'Project update: ...'
   })

2. Communication module:
   a. Fetches group from store:
      {
        groupId: 'group-email-001',
        provider: 'email',
        name: 'stakeholders',
        members: [
          { contactSlug: 'alice', emailRecipientType: 'to', username: 'alice@company.com' },
          { contactSlug: 'bob', emailRecipientType: 'cc', username: 'bob@company.com' },
          { contactSlug: 'carol', emailRecipientType: 'bcc', username: 'carol@company.com' }
        ]
      }

   b. Calls provider.sendMessage({
        toAddresses: ['alice@company.com'],
        ccAddresses: ['bob@company.com'],
        bccAddresses: ['carol@company.com'],
        content: 'Project update: ...'
      })
      - nodemailer composes email with To/CC/BCC
      - SMTP sends via configured server
      - Returns providerMessageId

   c. Stores in database:
      forge_communication_messages:
        messageId: uuid-yyy
        conversation_id: (group conversation)
        provider: 'email'
        provider_message_id: <Message-ID from SMTP>
        content: 'Project update: ...'

      forge_communication_group_conversations:
        groupId: 'group-email-001'
        conversationId: uuid-group-conv
        created_at: now()

3. Returns: { success: true, messageId, conversationId }
```

### 6.4 File Structure

```
packages/mastra-engine/src/
├── agent/communication/
│   ├── module.ts                      [MODIFIED] Add createGroup, updateGroup, etc.
│   ├── store.ts                       [MODIFIED] Add group tables + queries
│   ├── tools.ts                       [MODIFIED] Export new group tools
│   ├── provider-types.ts              [MODIFIED] Extend CommunicationProvider interface
│   ├── groups/                        [NEW]
│   │   ├── group-manager.ts           [NEW] Centralized group operations
│   │   ├── discord-groups.ts          [NEW] Discord group implementation
│   │   └── email-groups.ts            [NEW] Email group composition
│   └── tools/
│       ├── create-group.ts            [NEW]
│       ├── update-group.ts            [NEW]
│       ├── list-groups.ts             [NEW]
│       ├── get-group.ts               [NEW]
│       ├── delete-group.ts            [NEW]
│       └── send-message.ts            [MODIFIED] Handle groupId parameter
└── accounts/
    ├── discord.ts                     [MODIFIED] Add group methods
    └── email.ts                       [MODIFIED] Add CC/BCC support
```

---

## 7. Implementation Plan

### Phase 1: Data Model & Store (Week 1)
- [ ] Add 3 new tables to communication store
- [ ] Create migrations (if using versioned schema)
- [ ] Define TypeScript interfaces for Group and GroupMember
- [ ] Add store methods: saveGroup, getGroup, updateGroupMembers

### Phase 2: Provider Extensions (Week 1-2)
- [ ] Extend Discord provider with createChannel, addChannelMembers, removeChannelMembers
- [ ] Extend Email provider to support CC/BCC in sendMessage
- [ ] Implement discord-groups.ts helper module
- [ ] Implement email-groups.ts helper module
- [ ] Update provider interface in provider-types.ts

### Phase 3: Communication Module (Week 2)
- [ ] Implement createGroup() in communication module
- [ ] Implement updateGroup() in communication module
- [ ] Implement listGroups(), getGroup(), deleteGroup()
- [ ] Extend sendMessage() to handle groupId parameter
- [ ] Test group creation and messaging end-to-end

### Phase 4: Agent Tools (Week 2-3)
- [ ] Create tool files: create-group.ts, update-group.ts, etc.
- [ ] Wire tools into module.ts and tools.ts
- [ ] Update tool definitions with input/output schemas
- [ ] Test tools via agent interface

### Phase 5: Integration Tests (Week 3)
- [ ] Discord: Create channel, add members, send message
- [ ] Email: Create group, send message with CC/BCC
- [ ] Verify store persistence
- [ ] Verify group conversation history

### Phase 6: Documentation (Week 3)
- [ ] Update communication module reference
- [ ] Add group examples to agent docs
- [ ] Document provider contract changes

---

## 8. Dependencies and Constraints

### External Dependencies
- **Discord.js:** Already integrated; no new version required
- **nodemailer:** Already integrated; no new version required
- **LibSQL:** Existing database; schema extensions only

### Internal Dependencies
- Communication store (existing)
- Provider registration system (existing)
- Contact resolution (existing)
- Wake queue (for inbound group messages)

### Constraints
1. **Email groups are virtual** — No server-side mailing lists; stored only in store
2. **Single guild assumption** — Discord provider assumes single guild (does not support multi-server agents)
3. **No real-time sync** — Member changes are not pushed to providers; next send uses current membership
4. **Backward compatibility** — Existing sendMessage() API remains unchanged; groupId is optional
5. **No nested groups** — Groups cannot contain other groups in v1

---

## 9. Success Metrics

### Functional Metrics
- ✅ Agents can create Discord channels with >2 members
- ✅ Agents can send email messages to groups with CC/BCC recipients
- ✅ Agent can update group membership (add/remove)
- ✅ Group conversation history is persisted and retrievable
- ✅ 100% consistency between store and provider state (eventual)

### Performance Metrics
- **Group creation:** < 2 seconds (Discord API call + store save)
- **Message send to group:** < 3 seconds (Email: SMTP send + store; Discord: API + store)
- **Group list retrieval:** < 500ms (store query only)
- **Member count impact:** No performance degradation for groups > 50 members

### Reliability Metrics
- **Error recovery:** Failed provider operations do not corrupt store state
- **Idempotency:** Duplicate group creation requests are deduplicated
- **Store consistency:** Group metadata always matches provider state at next operation

---

## 10. Risk Analysis

### Risk 1: Discord Rate Limiting
**Severity:** Medium
**Impact:** Group creation may fail if agent creates multiple channels rapidly
**Mitigation:** Implement exponential backoff; queue channel creations

### Risk 2: Email CC/BCC Complexity
**Severity:** Medium
**Impact:** Complex logic to maintain separate To/CC/BCC lists; higher bug surface
**Mitigation:** Comprehensive tests; consider email-specific edge cases (large groups, invalid emails)

### Risk 3: Schema Migration
**Severity:** Low
**Impact:** Existing agents without new tables may break
**Mitigation:** Add migration logic; auto-create tables on first use (similar to existing flow)

### Risk 4: Group Consistency Across Providers
**Severity:** Low
**Impact:** Agent confusion if group membership diverges between store and provider
**Mitigation:** v1 is unidirectional (store is source of truth); provider is secondary

### Risk 5: Email Group Conflicts
**Severity:** Low
**Impact:** Two agents sending to overlapping email groups may create confusion
**Mitigation:** Groups are agent-scoped; not shared across agents

---

## 11. Future Enhancements (v2+)

1. **Group Permissions & Roles** — Support read-only, member, admin roles
2. **Group Settings UI** — Web dashboard for group management
3. **Real-time Sync** — Push membership changes to providers immediately
4. **Private/Public Groups** — Explicit classification with access control
5. **Email Mailing Lists** — Server-side mailing list creation (requires mail server integration)
6. **Group Webhooks** — External notifications for group events (member added, message posted)
7. **Group Templates** — Pre-defined group structures for common use cases (tech team, sales team, etc.)
8. **Nested Groups** — Groups containing other groups or managed team hierarchies
9. **Archive/Restore** — Soft-delete groups; restore from archive
10. **Multi-Guild Discord Support** — Agents spanning multiple Discord servers

---

## 12. Acceptance Criteria

### Feature Acceptance
- [ ] Discord groups created via agent tools are visible in Discord UI
- [ ] Email messages sent to groups include correct To/CC/BCC recipients
- [ ] Group membership can be updated without recreating the group
- [ ] Group conversation history is retrievable via listConversations()
- [ ] Agents can list all groups with memberCount and provider info
- [ ] Group deletion removes group and conversation associations from store
- [ ] Provider-specific errors are properly caught and reported to agent

### Code Quality
- [ ] All new code has >80% test coverage (unit + integration)
- [ ] Types are strict (no `any`; use zod schemas)
- [ ] Error handling is comprehensive (no unhandled rejections)
- [ ] Documentation is complete (README + API docs)

### Backward Compatibility
- [ ] Existing sendMessage() calls (without groupId) work unchanged
- [ ] Existing agents without groups do not experience performance degradation
- [ ] Conversation API unchanged for non-group conversations

---

## 13. Sign-Off and Timeline

**Feature Lead:** [To be assigned]
**PM:** Nicolas (Product)
**Reviewers:** [Engineering team]

**Estimated Delivery:** 3 weeks (full implementation + testing + docs)

**Key Milestones:**
- **Week 1:** Data model + provider extensions
- **Week 2:** Communication module + agent tools
- **Week 3:** Integration tests + documentation

---

**Document Version:** 0.1
**Last Updated:** 2026-03-15
**Next Review:** After initial implementation planning review
