# PRD-09: Internal Group Chat Implementation

> **Note:** This is a personal project for a solo developer using LLM agents. Simplified for ease and practicality (KISS + YAGNI). Enterprise features like role-based access, webhooks, and advanced permissions are out of scope.

**Feature**: Internal Group Chat Implementation
**Version**: 1.0
**Status**: In Analysis & Planning
**Last Updated**: 2026-03-15

---

## 1. Executive Summary

### Classification: MASTRA FRAMEWORK

**This PRD describes core multi-agent communication infrastructure for the Mastra framework.** Group messaging is a fundamental pattern for coordinating multiple agents. This is framework-level infrastructure applicable to any Mastra deployment supporting team-based agent coordination.

This PRD outlines the implementation of group chat capabilities within the internal communication system. Currently, the communication module supports only direct messages (1-to-1 conversations). This feature extends that system to enable multiple agents to coordinate through group-based messaging.

**Core Objective (Framework)**: Enable any Mastra agents to create and participate in group conversations for coordination, enabling team-based agent workflows.

**Core Objective (ad-product-forge)**: Enable Nicolas' agents to form teams (research, development, operations) and coordinate through internal group messaging.

---

## 2. Vision

Build a simple communication infrastructure where agents can organize into groups and coordinate asynchronously.

---

## 3. Problem Statement

### 3.1 Current State
- **Communication module** supports only direct messages between agents and external contacts
- **Limitation**: No mechanism for multi-agent coordination without external platforms (Discord, Email)
- **Scope**: Internal system lacks native group communication features
- **Impact**: Agents cannot easily coordinate as teams; every collaboration requires external provider integration

### 3.2 User Needs
- **Multi-agent coordination**: Create project teams and task forces
- **Asynchronous information sharing**: Pass context and state between agents without real-time waiting
- **Message history**: Maintain full conversation record for audit and context recovery
- **Permission boundaries**: Control who can access which groups
- **Channel organization**: Structure conversations by domain, project, or team function

---

## 4. Objectives & Success Metrics

### 4.1 Primary Objectives
1. **Extend communication module** to support 1-to-N conversation model (groups)
2. **Create group lifecycle management**: Group creation, membership, and deletion
3. **Enable group-based messaging**: Send and receive messages within group context
4. **Maintain compatibility**: Ensure existing DM functionality remains unaffected
5. **Provide agent-facing API**: Groups accessible via same tool interface as conversations

### 4.2 Success Metrics
| Metric | Target |
|---|---|
| Group creation | Works reliably |
| Message delivery | Groups receive messages |
| API compatibility | 100% backward compatible |
| Simple implementation | Solo dev can maintain in 2-3 weeks |

---

## 5. Functional Requirements

### 5.1 Group Entity Model

#### 5.1.1 Group Schema
```
Group {
  groupId: UUID                 // Internal unique identifier
  internalProvider: "internal"  // Fixed provider for internal groups
  name: string                  // Group display name
  description?: string          // Optional group purpose/notes
  ownerId: string              // Agent ID of group creator
  createdAt: ISO8601           // Creation timestamp
  updatedAt: ISO8601           // Last modification timestamp
  isActive: boolean            // Soft delete flag
  metadata?: Record<string,any>// Provider-agnostic extensibility
}
```

#### 5.1.2 Group Membership Schema
```
GroupMember {
  groupId: UUID                // Which group
  contactSlug: string          // Which agent (via existing Contact system)
  joinedAt: ISO8601           // When added to group
  role?: string               // Future: admin, moderator, member
  isActive: boolean           // Soft remove from group
}
```

#### 5.1.3 Key Design Decisions
- Groups use the **internal provider** (no external platform required)
- Groups leverage **existing Contact system**: members are identified by `contactSlug`
- Groups identified by `(provider="internal", providerGroupKey=groupId)`
- Messages flow through **existing message persistence layer**

### 5.2 Agent-Facing API

All group operations exposed as agent tools via the communication module.

#### 5.2.1 Group Management Tools

**listGroups()**
```typescript
listGroups(input?: {
  limit?: number;           // Default: 100
  offset?: number;          // Default: 0
  onlyActive?: boolean;     // Default: true
}): Promise<Array<{
  groupId: string;
  name: string;
  description?: string;
  memberCount: number;
  createdAt: string;
  ownerId: string;
  isOwner: boolean;         // Whether caller is owner
}>>
```

**getGroup(groupId)**
```typescript
getGroup(groupId: string): Promise<{
  groupId: string;
  name: string;
  description?: string;
  ownerId: string;
  createdAt: string;
  members: Array<{
    contactSlug: string;
    displayName: string;
    joinedAt: string;
  }>;
  isOwner: boolean;
}>
```

**createGroup(input)**
```typescript
createGroup(input: {
  name: string;               // Required
  description?: string;
  memberSlugs?: string[];     // Initial members (default: creator only)
}): Promise<{
  groupId: string;
  name: string;
  createdAt: string;
}>
```

**addGroupMember(groupId, contactSlug)**
```typescript
addGroupMember(input: {
  groupId: string;
  contactSlug: string;
}): Promise<{
  success: boolean;
  groupId: string;
  contactSlug: string;
  joinedAt: string;
}>
```

**removeGroupMember(groupId, contactSlug)**
```typescript
removeGroupMember(input: {
  groupId: string;
  contactSlug: string;
}): Promise<{
  success: boolean;
  groupId: string;
}>
```

**updateGroup(groupId, updates)**
```typescript
updateGroup(input: {
  groupId: string;
  name?: string;
  description?: string;
}): Promise<{
  groupId: string;
  updatedAt: string;
}>
```

#### 5.2.2 Message Tools (Extended)

Existing message tools modified to support groups:

**sendMessage(input)** — Enhanced
```typescript
sendMessage(input: {
  provider: "internal";           // Required for groups
  groupId?: string;               // Either groupId OR conversationId
  conversationId?: string;        // (not both, not neither)
  contactSlug?: string;           // Ignored for groups
  content: string;
  replyToMessageId?: string;
}): Promise<{
  success: boolean;
  messageId: string;
  groupId?: string;               // Populated if sent to group
  conversationId?: string;        // Populated if sent to DM
}>
```

**listConversations()** — Enhanced
```typescript
listConversations(input: {
  provider?: string;              // Can now filter "internal" groups
  groupId?: string;               // NEW: filter by group
  unread?: boolean;
  limit: number;
}): Promise<Array<{
  conversationId?: string;        // Null for group conversations
  groupId?: string;               // Populated for groups
  provider: string;               // "internal" for groups
  name: string;
  type: "dm" | "group";          // NEW: conversation type
  memberCount?: number;           // Populated for groups
  lastMessageAt: string;
  unreadCount: number;
  messages: MessageView[];
}>>
```

**getMessages(conversationId or groupId)** — Enhanced
```typescript
getMessages(input: {
  conversationId?: string;        // Either conversationId OR
  groupId?: string;               // groupId (not both)
  limit: number;
}): Promise<MessageView[]>
```

### 5.3 Data Persistence

#### 5.3.1 New Tables (Communication Store)

**forge_communication_groups**
```
CREATE TABLE forge_communication_groups (
  group_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,           // Always "internal"
  provider_group_key TEXT NOT NULL, // Same as group_id
  name TEXT NOT NULL,
  description TEXT,
  owner_id TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata TEXT,                    // JSON blob for extensibility
  UNIQUE(provider, provider_group_key)
);
```

**forge_communication_group_members**
```
CREATE TABLE forge_communication_group_members (
  group_id TEXT NOT NULL,
  contact_slug TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  role TEXT DEFAULT 'member',      // Scoped for future use
  is_active BOOLEAN DEFAULT true,
  PRIMARY KEY (group_id, contact_slug),
  FOREIGN KEY (group_id) REFERENCES forge_communication_groups(group_id)
);
```

#### 5.3.2 Message Association

Existing `forge_communication_messages` table gains:
```
ALTER TABLE forge_communication_messages ADD COLUMN group_id TEXT;
-- group_id is NULL for DMs, populated for group messages
-- Query pattern: find all messages where (group_id = X) OR (conversation_id = Y)
```

#### 5.3.3 Conversation Flexibility

Existing `forge_communication_conversations` table strategy:
- **Option A** (Recommended): Create synthetic conversation record per (group, agent) pair
  - Simplifies query logic
  - Maintains "list my conversations" pattern
  - Trade-off: more records, but cleaner API
- **Option B**: Bifurcate conversations by type (DM vs Group)
  - Simpler storage
  - More complex query logic
  - Risk: API inconsistency

**Decision**: Implement **Option A** with:
- One logical conversation per (groupId, agentId) for UI/history purposes
- All group messages stored with `group_id` + actual author context
- Agent-facing tools return unified conversation list with `type: "group" | "dm"`

---

## 6. Technical Architecture

### 6.1 Module Responsibilities

```
Communication Module (enhanced)
├─ Group Management
│  ├─ Create group (+ auto-create synthetic conversations)
│  ├─ Add/remove members (update group_members table)
│  ├─ Update group metadata
│  └─ Soft delete groups
├─ Group Message Routing
│  ├─ Route outbound message to all group members
│  ├─ Persist message with group_id
│  ├─ Create per-member message view
│  └─ Trigger wake events for each member
├─ Query Optimization
│  ├─ Fast group lookup by ID
│  ├─ Fast membership queries
│  └─ Fast message history retrieval
└─ Wake Event Integration
   └─ Notify all group members on new message (batched)
```

### 6.2 Message Flow — Group Outbound

```
Agent.sendMessage({ provider: "internal", groupId: X, content: "..." })
  ↓
Communication.sendMessage()
  ├─ Validate group exists and agent is member
  ├─ Fetch all group members (except sender, optional)
  ├─ For each member:
  │  ├─ Create message with { group_id: X, author: agent1 }
  │  ├─ Mark unread for recipient
  │  └─ Persist to store
  ├─ Batch wake events: notifyExternalEvent() for each member
  └─ Return success + messageId
```

### 6.3 Message Flow — Group Inbound

Group inbound is **synthetic** (no external provider):
- Messages originate from agent tool calls (not external webhooks)
- Flow is entirely **outbound → storage → wake**
- No polling or provider callbacks needed

### 6.4 Backward Compatibility

**Existing DM Logic Unchanged**:
- `sendMessage({ provider, conversationId, contactSlug, ... })`
- `listConversations(provider, contactSlug)`
- Contact auto-sync and discovery

**API Extensions**:
- New optional `groupId` parameter on `sendMessage()`
- New optional `groupId` filter on `listConversations()`
- New `type: "dm" | "group"` field in conversation response

**Migration Path**:
- Phase 1: Deploy new tables + tools (no breaking changes)
- Phase 2: Gradually surface group features in agent prompts/documentation

---

## 7. Implementation Plan

**Total: 2-3 weeks solo developer effort**

**Deliverables**:
- Database tables: `forge_communication_groups`, `forge_communication_group_members`
- Store CRUD operations: `createGroup()`, `getGroup()`, `addMember()`, `removeMember()`
- Message storage extension: `group_id` column
- Agent tools: `createGroup()`, `listGroups()`, `sendMessage()` (extended), `addGroupMember()`, `removeGroupMember()`
- Wake queue integration for group messages
- Basic tests and documentation

---

## 8. Requirements & Constraints

### 8.1 Functional Requirements

| Req ID | Requirement | Priority |
|---|---|---|
| F1 | Create group with name + optional description | MUST |
| F2 | Add existing agents to group | MUST |
| F3 | Send message to group (all members receive) | MUST |
| F4 | Remove agent from group | SHOULD |
| F5 | List my groups | MUST |
| F6 | Get group details + members | MUST |
| F7 | Retrieve group message history | MUST |

### 8.2 Non-Functional Requirements

| Req ID | Requirement | Target |
|---|---|---|
| NFR1 | Group creation latency | <100ms |
| NFR2 | Message send latency | <50ms |
| NFR3 | Backward compatibility | 100% |

### 8.3 Authorization

**Group Permissions V1**:
- Any agent can create a group
- Group creator can add/remove members
- Only group members can send/read messages
- Group owner can update metadata

### 8.4 Data Retention

- Message retention: Same as existing conversations
- Soft deletes: Groups marked `is_active=false`
- No encryption required (internal system, trusted agents)

---

## 9. Use Cases & User Stories

### 9.1 Use Case: Onboarding New Agent via Group

```
Scenario: A new sales agent is hired.
The hiring agent creates a "Sales Team 2026-Q2" group,
adds 5 agents (new + existing), and shares coordination
information in the group without external Slack/Discord.

Flow:
1. hiring_agent calls createGroup({ name: "Sales Team...", memberSlugs: [...] })
2. System creates group + adds members
3. hiring_agent calls sendMessage({ groupId, content: "Welcome! Here's context..." })
4. All 5 agents receive message + wake event
5. New agent can immediately call listGroups() and see their group assignment
```

**User Story**:
> As an agent hiring manager, I want to create internal team groups
> so that I can coordinate with my team without relying on external platforms.

### 9.2 Use Case: Specialist Agent Coordination

```
Scenario: A complex task requires 3 specialist agents.
The main agent creates a temporary task force group,
shares requirements, monitors progress asynchronously.

Flow:
1. main_agent creates "Q2 Market Analysis" group + adds specialists
2. Specialists work independently, post updates to group
3. main_agent wakes on new messages, aggregates results
4. When task complete, main_agent removes specialist from group
```

**User Story**:
> As an orchestration agent, I want to coordinate specialist agents
> so that I can decompose complex work and track progress asynchronously.

### 9.3 Use Case: Self-Messaging for Scheduled Tasks

```
Scenario: An agent creates a cron job for daily review.
The scheduler sends a message to a "Self-Reminders" group
(containing only the agent), triggering a wake + task execution.

Flow:
1. agent creates "Self-Reminders" group (solo)
2. Cron triggers send to group (simpler than email/Discord)
3. Agent wakes, processes scheduled task
```

**User Story**:
> As an agent, I want to schedule reminders to myself
> so that I can execute recurring tasks without external dependency.

---

## 10. Risk Analysis & Mitigation

### Technical Risks

| Risk | Mitigation |
|---|---|
| **Database contention** on group messages | Simple design; profile if needed |
| **Wake event storm** | Reuse existing debounce (1000ms) |
| **Backward compatibility break** | API extensions only; no breaking changes |

---

## 11. Success Criteria & Acceptance Tests

### 11.1 Functional Acceptance

- [ ] An agent can create a group with a name
- [ ] An agent can add other agents to their group
- [ ] A group member can send a message visible to all members
- [ ] Non-members cannot see group history or messages
- [ ] An agent can list all groups they belong to
- [ ] Group members receive wake events on new messages
- [ ] Existing DM functionality is unaffected
- [ ] Removing an agent from a group succeeds and prevents future sends

### 11.2 Performance Acceptance

- [ ] Creating a 100-agent group completes in <1 second
- [ ] Sending a message to a 100-agent group completes in <500ms
- [ ] Retrieving 1000-message group history completes in <300ms
- [ ] Listing 1000 groups completes in <500ms

### 11.3 Reliability Acceptance

- [ ] Zero data loss on group creation failures (ACID)
- [ ] All group members receive messages (100% delivery)
- [ ] No redundant wake events for same message
- [ ] Database migration is idempotent and reversible

---

## 12. Dependencies & Integration Points

### 12.1 Internal Dependencies

| Component | Dependency | Risk | Mitigation |
|---|---|---|---|
| **Communication Module** | Core store, provider registry | Low | Already mature; only extending |
| **Contact System** | Use existing `contactSlug` lookup | Low | No changes needed to Contact API |
| **Wake Queue** | Batch event notification | Low | Reuse existing debounce logic |
| **Agent Tools System** | Register new group tools | Low | Standard tool registration pattern |
| **Database (LibSQL/Drizzle)** | New table schemas | Medium | Migrations tested in isolation first |

### 12.2 External Dependencies

None for Phase 1. Future integrations:
- **Email provider** (Section 8.3 ROADMAP): CC/BCC for group mail
- **Discord provider** (Section 5.2 ROADMAP): Channel creation
- **Role system** (Section 3.1 ROADMAP): Permission scoping

---

## 13. Open Questions & Future Considerations

### 13.1 Open Questions

1. **Synthetic Conversation Records**: Create one `conversation` record per (group, agent) or separate queries?
   - **Current decision**: Option A (synthetic, cleaner API)

2. **Message Attribution**: Store author contact slug or agent ID?
   - **Current decision**: Store author contact slug (consistent with Contact model)

3. **Group Discoverability**: Agents see all groups or only their own?
   - **Current decision**: Only own groups in V1

### 13.2 Future Extensions

- Full-text search within groups
- Message reactions
- Rich media (files, images)
- Message threading
- Moderation tools
- Integration with external providers

---

## 14. Success Timeline

**Total MVP: 2-3 weeks** for solo developer

Simple, straightforward implementation with no enterprise features.

---

## Appendix A: Schema Diagrams

### Communication Store Tables (Updated)

```
Existing:
  ├─ forge_communication_accounts
  ├─ forge_communication_contacts
  ├─ forge_communication_contact_accounts
  ├─ forge_communication_conversations (now optional for groups)
  └─ forge_communication_messages (now has group_id column)

New:
  ├─ forge_communication_groups
  └─ forge_communication_group_members
```

### Entity Relationships

```
Group (1) ──── (N) GroupMember ──── (1) Contact
  │
  └──── (N) Messages (via group_id)
         └──── (1) Contact (author)
```

---

## Appendix B: API Examples

### Example 1: Create Group & Send Message

```typescript
// Agent 1: Create a group and invite teammates
const groupRes = await communication.createGroup({
  name: "Q2 Product Strategy",
  description: "Coordination for Q2 roadmap planning",
  memberSlugs: ["agent-2", "agent-3", "agent-4"]
});
const groupId = groupRes.groupId; // uuid

// Agent 1: Send initial context
await communication.sendMessage({
  provider: "internal",
  groupId: groupId,
  content: "Welcome team! Our Q2 focus is: [...]"
});

// Agent 2-4: Receive message + wake event (batched)
// Agent 2: Check groups and see message
const groups = await communication.listGroups({ limit: 10 });
const myGroup = groups.find(g => g.name === "Q2 Product Strategy");

const messages = await communication.getMessages({
  groupId: myGroup.groupId,
  limit: 50
});
// messages[0].content == "Welcome team! Our Q2 focus is: [...]"
```

### Example 2: Manage Group Members

```typescript
// Remove a member who has completed their task
await communication.removeGroupMember({
  groupId: groupId,
  contactSlug: "agent-3"
});

// Add a new specialist to the group
await communication.addGroupMember({
  groupId: groupId,
  contactSlug: "specialist-ai"
});

// Verify membership
const updated = await communication.getGroup(groupId);
console.log(updated.members); // [agent-2, agent-4, specialist-ai]
```

### Example 3: Self-Reminders for Cron Tasks

```typescript
// Create a solo group for daily reminders
const reminderGroup = await communication.createGroup({
  name: "self-reminders",
  memberSlugs: ["self"] // Only include self
});

// Cron job sends reminder
await communication.sendMessage({
  provider: "internal",
  groupId: reminderGroup.groupId,
  content: "Daily standup: check pending tasks and resume work"
});
// Agent wakes, processes message, executes task
```

---

## Appendix C: Glossary

| Term | Definition |
|---|---|
| **Group** | A multi-agent conversation container (1-to-N messaging) |
| **Group Member** | An agent (Contact) participating in a group |
| **Group Owner** | The agent who created the group; has membership mgmt rights |
| **Internal Provider** | Fixed communication provider for internal groups (no external platform) |
| **Synthetic Conversation** | A (groupId, agentId) conversation record for API consistency |
| **Wake Event** | Notification to agent that new external/group activity occurred |
| **Debounce** | Batching of multiple wake events to reduce redundant agent activations |
| **Soft Delete** | Marking record `is_active=false` instead of physical deletion |

---

## Document History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-03-15 | Product Analysis | Initial PRD: core requirements, architecture, roadmap, acceptance criteria |
