# PRD-10: Multi-Provider Group Support

> **Note:** This is a personal project for a solo developer using LLM agents. Simplified for ease and practicality (KISS + YAGNI). Enterprise features like real-time sync, role-based permissions, and webhooks are out of scope.

**Status:** Draft - Analysis & Planning
**Date:** 2026-03-15
**Version:** 0.1
**Feature ID:** prd-10

---

## 1. Executive Summary

**Objective:** Extend the agent communication system to support group-based messaging across all providers (Discord, Email).

**Value Proposition:**
- Agents can create and manage groups across all communication providers
- Distribute messages efficiently to multiple recipients
- Unified API for group operations
- Maintain consistency in group membership and communication history

**Scope:**
- Discord: Channel creation, group messaging via channels
- Email: CC/BCC functionality, group message history
- Core: Group entity in communication store, agent-facing tools for group management

---

## 2. Problem Statement

### Current State
- Individual conversations are supported (1-to-1 messaging)
- Discord channels exist but without explicit group management
- Email provider lacks CC/BCC support
- No unified interface for groups across providers

### Pain Points
1. Agents must send individual messages for multiple recipients
2. Discord channels and email groups have inconsistent semantics
3. Cannot programmatically create or manage groups
4. Different logic needed for each provider

### Impact Without Solution
- Reduced agent capability for coordination
- Higher complexity for multi-recipient communication
- Fragmented group data across providers

---

### Goals
1. Create groups in Discord (agents can create channels and invite members)
2. Manage group membership (add/remove members)
3. Send group messages to Discord channels
4. Store group metadata
5. Unified agent API for group operations

### Non-Goals
1. Real-time group sync
2. Group permissions/roles
3. Group settings UI
4. Private/public group classification
5. Archive/restore groups
6. Email CC/BCC groups (keep simple)

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
  joined_at TEXT NOT NULL,

  PRIMARY KEY (group_id, member_contact_slug),
  FOREIGN KEY (group_id) REFERENCES forge_communication_groups(group_id)
);
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
  groupId: string;              // Send to group
  content: string;
  replyToMessageId?: string;
}): Promise<{ success: boolean; messageId: string }>
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

**Total: 2 weeks solo developer effort**

**Key Deliverables:**
- Add 2 new tables to communication store (groups + members)
- Discord provider extensions: createChannel, addChannelMembers, removeChannelMembers
- Communication module group operations
- Agent tools: createGroup, listGroups, sendMessage (extended), addGroupMember, removeGroupMember
- Discord-specific implementation
- Integration tests and documentation

---

## 8. Dependencies and Constraints

### External Dependencies
- Discord.js: Already integrated
- nodemailer: Already integrated
- LibSQL: Existing database; schema extensions only

### Internal Dependencies
- Communication store (existing)
- Provider registration system (existing)
- Contact resolution (existing)

### Constraints
1. Email groups are virtual (no server-side mailing lists)
2. Single guild assumption (Discord provider assumes single server)
3. No real-time sync (member changes are one-way to provider)
4. Backward compatible (existing sendMessage() unchanged)
5. No nested groups in v1

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
**Mitigation:** Implement exponential backoff if needed; queue channel creations

### Risk 2: Schema Migration
**Severity:** Low
**Mitigation:** Auto-create tables on first use (existing pattern)

---

## 11. Future Enhancements

1. Group permissions & roles (if needed)
2. Email group support (if needed)
3. Real-time sync to providers
4. Multi-guild Discord support

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
- [ ] Core functionality tested
- [ ] Types are properly typed
- [ ] Error handling covers main cases
- [ ] Documentation is clear

### Backward Compatibility
- [ ] Existing sendMessage() calls work unchanged
- [ ] Existing agents unaffected
- [ ] Conversation API unchanged for non-group conversations

---

## 13. Timeline

**Estimated Delivery:** 2 weeks (solo developer)

**Solo Developer Plan:**
- Data model + provider extensions
- Communication module + agent tools
- Integration tests + documentation

---

**Document Version:** 0.1
**Last Updated:** 2026-03-15
**Next Review:** After initial implementation planning review
