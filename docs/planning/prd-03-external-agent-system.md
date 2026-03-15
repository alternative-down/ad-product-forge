# PRD-03: External Agent System

**Status:** Planning
**Feature:** External Agent System
**Last Updated:** 2026-03-15

> **Note:** Este é um projeto pessoal de desenvolvedor solo. Requisitos focam em funcionalidade, não robustez corporativa.

---

## 1. Executive Summary

The External Agent System enables dynamic creation of temporary specialist agents spawned on-demand to fulfill specific tasks. These external agents act as consultants or domain experts with restricted permissions (messaging only), managed through existing communication infrastructure. External agents wake on messages and can be terminated once tasks complete.

**Value:**
- Enable multi-agent workflows with specialized consultation
- Support persona-based interactions
- Reduce load on main agents via task delegation
- Isolate external agents from internal data

---

## 2. Problem Statement

Current agents operate as isolated entities with fixed capabilities. There is no mechanism to:

1. Spawn temporary specialist agents for short-lived consultation tasks
2. Isolate external agent capabilities and data access
3. Enable structured communication between internal and external agents
4. Manage the lifecycle of temporary agents efficiently
5. Support use cases like persona-based interviews, expert consultations, or research assistance without burdening the main agent

This limitation reduces flexibility in agent-based workflows and prevents design patterns where expert delegation improves output quality while maintaining security boundaries.

---

## 3. Goals & Success Criteria

### Primary Goals

1. **Controlled External Agent Creation**
   - Internal agents can request creation of external specialist agents
   - External agents are created with a defined scope and capabilities
   - Creation includes configured system prompt, role, and expertise area

2. **Communication Isolation**
   - External agents communicate exclusively via internal messaging system
   - No direct access to company resources, databases, or APIs
   - Communication is auditable and traceable

3. **Lifecycle Management**
   - External agents wake only on incoming messages
   - Agents can be explicitly terminated when tasks complete
   - Agents can self-terminate based on completion signals
   - Resource cleanup is automatic

4. **Security & Compliance**
   - External agents never see sensitive internal data
   - All external agent activities are logged and auditable
   - Permission model is explicit and restrictive by default

### Success Criteria

- [ ] External agents are created dynamically
- [ ] Communication works between internal and external agents
- [ ] External agents terminate cleanly
- [ ] Interactions are logged
- [ ] System supports 50+ concurrent external agents

---

## 4. Target Users & Use Cases

### Target Users

1. **Internal Agent Orchestrators** — Agents that delegate specialized tasks
2. **Development Teams** — Building complex multi-agent workflows
3. **Research Teams** — Running persona-based studies and consultations
4. **Product Teams** — Pre-interview scenarios and expert evaluation

### Key Use Cases

#### 4.1 Persona-Based Pre-Interviews
An internal "recruiting" agent creates a temporary external "candidate" persona agent. The recruiting agent conducts a structured interview with the candidate persona to evaluate questions and process, then terminates the agent. The candidate never sees internal recruiting data.

**Workflow:**
```
Internal Recruiting Agent
  ├─ Request: Create "Senior Engineer Persona"
  ├─ External Candidate Agent spawned with system prompt defining background
  ├─ Recruiting agent sends interview questions
  ├─ Candidate agent responds in character
  ├─ Recruiting agent terminates agent after evaluation
  └─ Internal agent analyzes interview results
```

#### 4.2 Expert Consultation
An internal "research" agent creates external "domain expert" agents (data scientist, ethicist, architect) for specialized evaluation. The research agent shares only relevant context, not internal data. Experts provide analysis and reasoning, then are terminated.

**Workflow:**
```
Internal Research Agent
  ├─ Create "Data Scientist Expert"
  ├─ Create "Ethics Expert"
  ├─ Create "Architecture Expert"
  ├─ Send sanitized problem context to each
  ├─ Collect expert perspectives
  ├─ Integrate insights
  └─ Terminate all expert agents
```

#### 4.3 Research Workflow Support
An internal "research" agent creates temporary "research assistant" agents to help gather structured information, synthesize findings, or validate hypotheses. Research assistants have access only to the conversation with the research agent, not to internal databases.

**Workflow:**
```
Internal Research Agent
  ├─ Create "Research Assistant"
  ├─ Send research goals and sanitized background
  ├─ Assistant provides structured analysis via messages
  ├─ Research agent iterates and refines
  └─ Terminate assistant when research phase complete
```

#### 4.4 Customer Support Escalation
An internal support agent creates a temporary "specialist support agent" for complex issues. The specialist has authority to provide advice within defined boundaries but cannot access customer databases or billing systems.

**Workflow:**
```
Internal Support Agent
  ├─ Create "Technical Specialist"
  ├─ Share customer issue (no PII, no customer ID)
  ├─ Specialist provides troubleshooting guidance
  ├─ Support agent integrates guidance into customer response
  └─ Terminate specialist agent
```

---

## 5. Feature Overview & Design

### 5.1 Core Concepts

#### External Agent
A temporary, specialist agent instance created on-demand. Characteristics:
- **Lifecycle:** Created by request, exists until terminated
- **Scope:** Single conversation with the requesting internal agent
- **Permissions:** Message-only communication, no resource access
- **Resources:** Minimal—CPU only when messages arrive (wake queue)
- **Identity:** Unique ID per instance, tied to creator agent

#### External Agent Request
A structured request from an internal agent to spawn an external agent. Contains:
- `agentId` — requesting internal agent
- `externalAgentName` — name/ID of external agent instance
- `role` — specialist role or persona (e.g., "Senior Engineer", "Domain Expert")
- `systemPrompt` — system instructions defining expertise and boundaries
- `context` — optional sanitized context to seed the agent
- `maxTokens` — token budget per response (optional)
- `terminationSignal` — signal that triggers self-termination (optional)

#### Creator-External Relationship
- One-to-many: One internal agent can create multiple external agents
- Scoped communication: Each external agent communicates only with its creator
- Termination: Creator or external agent can terminate
- Audit: All messages logged with creator ID and external agent ID

### 5.2 Architecture Overview

```
Internal Agent
  │
  ├─ Request: Create External Agent
  │
  └─ createExternalAgent({
       name,
       role,
       systemPrompt,
       context
     })
       │
       ├─ Generate externalAgentId (UUID)
       ├─ Create agent instance (via createAgent)
       │  ├─ Assign to special "external" pool
       │  ├─ Inject system prompt + context
       │  └─ Configure messaging-only tools
       ├─ Store mapping: externalAgentId → creatorAgentId
       ├─ Register wake queue handler
       └─ Return externalAgentId + conversationId
       │
       └─ External Agent Ready
            │
            ├─ sendMessage from creator
            │  └─ External agent receives via communication module
            │     └─ Wake event triggered (if external agent dormant)
            │        └─ agent.generate() with message
            │           └─ Response sent back
            │
            └─ Terminate request
               └─ Clean up resources + storage
```

### 5.3 Key Design Principles

1. **Delegation, Not Integration** — External agents are autonomous units, not library functions. They operate via messages, not shared data structures.

2. **Zero Trust** — External agents start with zero permissions. Only messaging capability is granted by default.

3. **Wake Queue Efficiency** — External agents consume no CPU while idle. Wake queue ensures minimal latency when messages arrive.

4. **Audit Trail** — All external agent interactions are logged with creator context.

5. **Graceful Cleanup** — Termination is explicit but cleanup is automatic.

6. **Scope Isolation** — Each external agent's conversation is isolated from other agents and internal data.

---

## 6. Detailed Requirements

### 6.1 External Agent Creation

**Tool:** `createExternalAgent()`
**Caller:** Internal agents
**Location:** `packages/mastra-engine/src/agent/external-agent/create-external-agent.ts`

**Input:**
```typescript
interface CreateExternalAgentRequest {
  name: string;                    // Display name (e.g., "Senior Engineer")
  role: string;                    // Role identifier (e.g., "engineer", "domain_expert")
  systemPrompt: string;            // System instructions (expertise + boundaries)
  context?: string;                // Optional sanitized context
  maxTokens?: number;              // Token budget per response (default: 2000)
  terminationSignal?: string;      // Text pattern triggering self-termination
}
```

**Output:**
```typescript
interface ExternalAgentCreated {
  externalAgentId: string;         // UUID, unique identifier
  conversationId: string;          // Conversation ID for communication
  createdAt: string;               // ISO 8601 timestamp
  role: string;                    // Echo of role
  status: "ready";                 // Agent ready to receive messages
}
```

**Behavior:**
1. Validate request (Zod schema)
2. Generate externalAgentId (UUID)
3. Call `createAgent()` with restricted config
   - Inject systemPrompt into agent config
   - Set agentId = externalAgentId
   - Enable only communication tools (sendMessage, getMessages)
   - Disable all other tools
4. Create database mapping: externalAgentId → creatorAgentId + metadata
5. Register wake queue handler
6. Return success with externalAgentId + conversationId

**Restrictions on External Agent Config:**
- No access to internal tools (databases, APIs, knowledge base)
- No file system access
- No external API calls (except via provider communication)
- Memory limited to conversation with creator
- Token limit enforced per response

### 6.2 Communication Protocol

**Tool:** `sendMessageToExternalAgent()`
**Caller:** Internal agents
**Location:** Exposed as agent tool in communication module

**Input:**
```typescript
interface SendToExternalAgentRequest {
  externalAgentId: string;         // Target external agent
  content: string;                 // Message content
  attachments?: Attachment[];      // Optional attachments (metadata only)
}
```

**Output:**
```typescript
interface SendToExternalAgentResponse {
  success: boolean;
  messageId: string;               // Internal message ID
  conversationId: string;          // For tracking conversation thread
  sentAt: string;                  // Timestamp
}
```

**Behavior:**
1. Validate externalAgentId exists and belongs to caller (creatorAgentId match)
2. Route message through communication module
3. Trigger wake event if external agent dormant
4. External agent generates response
5. Return confirmation with messageId

**Response Retrieval:**
```typescript
interface GetExternalAgentMessagesRequest {
  externalAgentId: string;
  limit?: number;                  // Default: 50
  after?: string;                  // Message ID (pagination)
}

interface ExternalAgentMessage {
  messageId: string;
  role: "user" | "assistant";      // user = from internal, assistant = from external
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}
```

### 6.3 Termination

**Tool:** `terminateExternalAgent()`
**Caller:** Internal agents
**Location:** Exposed as agent tool

**Input:**
```typescript
interface TerminateExternalAgentRequest {
  externalAgentId: string;
  reason?: string;                 // Optional termination reason (logged)
}
```

**Output:**
```typescript
interface TerminateExternalAgentResponse {
  success: boolean;
  externalAgentId: string;
  terminatedAt: string;
  resourcesCleaned: boolean;
}
```

**Behavior:**
1. Validate externalAgentId and creatorAgentId match
2. Mark agent as "terminated" in metadata store
3. Stop accepting new messages
4. Send final message to external agent if desired
5. Trigger cleanup:
   - Flush pending messages
   - Close wake queue
   - Archive conversation
   - Clear memory/state
6. Return success

**Self-Termination:**
If external agent receives terminationSignal in response, it can self-terminate via internal tool call.

### 6.4 Storage & Persistence

**Schema Additions:**
Location: `packages/mastra-engine/src/agent/communication/store.ts`

New table: `forge_external_agents`
```sql
CREATE TABLE forge_external_agents (
  external_agent_id TEXT PRIMARY KEY,
  creator_agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  context TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL,
  terminated_at TEXT
);
```

**Lifecycle:**
- Created when `createExternalAgent()` succeeds
- Marked "terminated" when termination requested

### 6.5 Security & Isolation

#### Tool Access Control
External agents have access to:
- ✅ `sendMessage()` — message creator agent only
- ✅ `getMessages()` — conversation with creator only
- ✅ Context from system prompt + creation request
- ❌ Any internal tools, databases, or APIs
- ❌ Knowledge base, long-term memory, or observational memory
- ❌ File system or external integrations
- ❌ Other agent conversations or data

**Implementation:**
- Tool filtering in `createAgent()` config for external agents
- Runtime validation on every tool call (externalAgentId context check)
- No cross-agent messaging capability

#### Data Isolation
- External agent storage (messages, observations) stored in isolated namespace
- No access to parent agent's memory or knowledge
- Conversation history visible only to creator and external agent
- Audit log captures all interactions with external agent ID + creator ID

#### Event Logging
- Log agent creation, termination
- Log message exchange (creator/external agent)
- Keep logs simple and functional

---

## 7. Implementation Plan

### Phase 1: Foundation
- [ ] Create `ExternalAgent` types and interfaces
- [ ] Implement `createExternalAgent()` tool
- [ ] Add `forge_external_agents` table schema
- [ ] Implement basic tool filtering

### Phase 2: Communication
- [ ] Integrate communication module for external agents
- [ ] Implement `sendMessageToExternalAgent()` tool
- [ ] Implement `getExternalAgentMessages()` tool
- [ ] Add wake queue integration

### Phase 3: Lifecycle Management
- [ ] Implement `terminateExternalAgent()` tool
- [ ] Implement resource cleanup
- [ ] Basic testing

### Phase 4: Testing & Documentation
- [ ] Integration tests
- [ ] Documentation and examples

---

## 8. Data Flow & Interactions

### Creation Flow
```
Internal Agent
  │
  └─ tool call: createExternalAgent({
       name: "Senior Engineer",
       role: "engineer",
       systemPrompt: "You are a senior engineer...",
       context: "Project details: ..."
     })
     │
     ├─ Generate externalAgentId (UUID)
     ├─ Call createAgent() with:
     │  ├─ id = externalAgentId
     │  ├─ instructions = systemPrompt + context
     │  ├─ tools = {sendMessage, getMessages} only
     │  └─ model = same as parent
     ├─ Insert into forge_external_agents
     │  ├─ creator_agent_id = internal agent ID
     │  ├─ status = "active"
     │  └─ created_at = now
     ├─ Register wake handler
     └─ Return externalAgentId
```

### Message Exchange Flow
```
Internal Agent
  │
  └─ tool call: sendMessageToExternalAgent({
       externalAgentId,
       content: "What is your assessment of..."
     })
     │
     ├─ Validate: externalAgentId exists && creator matches
     ├─ Create message via communication module
     │  ├─ Store in forge_communication_messages
     │  ├─ Mark unread
     │  └─ associatedWith: externalAgentId
     ├─ Trigger wake event
     │  └─ External Agent wakes
     │     └─ agent.generate() with:
     │        "You have a message from your creator agent: '...'"
     │        └─ Generate response
     │           ├─ Send via sendMessage() tool
     │           └─ Message stored + unread
     ├─ Wait for response (async or blocking)
     └─ Return confirmation

Internal Agent (continued)
  │
  └─ tool call: getExternalAgentMessages({
       externalAgentId,
       limit: 10
     })
     │
     ├─ Query forge_communication_messages WHERE externalAgentId
     ├─ Format as MessageView[]
     └─ Return to internal agent for processing
```

### Termination Flow
```
Internal Agent
  │
  └─ tool call: terminateExternalAgent({
       externalAgentId,
       reason: "Task complete"
     })
     │
     ├─ Validate: externalAgentId && creator match
     ├─ Update forge_external_agents
     │  ├─ status = "terminated"
     │  ├─ terminated_at = now
     │  └─ metadata: reason
     ├─ Log to audit table
     ├─ Stop accepting messages
     ├─ Close wake queue for this agent
     ├─ Archive conversation
     │  ├─ Move to cold storage or retention policy
     │  └─ Keep audit trail
     ├─ Clean up in-memory state
     └─ Return success
```

---

## 9. API Reference

### createExternalAgent()

**Type:** Tool (agent function)
**Module:** `packages/mastra-engine/src/agent/tools/external-agents.ts`
**Caller:** Internal agents
**Availability:** All agents via auto-registered tools

```typescript
tool.createExternalAgent({
  name: "Research Assistant",
  role: "research_assistant",
  systemPrompt: `You are a research assistant expert in...`,
  context: "Current research topic: ...",
  maxTokens: 2000,
  terminationSignal: "RESEARCH_COMPLETE"
}): Promise<{
  externalAgentId: string;
  conversationId: string;
  createdAt: string;
  role: string;
  status: "ready";
}>
```

### sendMessageToExternalAgent()

```typescript
tool.sendMessageToExternalAgent({
  externalAgentId: string,
  content: string,
  attachments?: Attachment[]
}): Promise<{
  success: boolean;
  messageId: string;
  conversationId: string;
  sentAt: string;
}>
```

### getExternalAgentMessages()

```typescript
tool.getExternalAgentMessages({
  externalAgentId: string,
  limit?: number;  // default: 50
  after?: string;  // message ID for pagination
}): Promise<{
  externalAgentId: string;
  conversationId: string;
  messages: Array<{
    messageId: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
    metadata?: Record<string, unknown>;
  }>;
  hasMore: boolean;
}>
```

### terminateExternalAgent()

```typescript
tool.terminateExternalAgent({
  externalAgentId: string,
  reason?: string
}): Promise<{
  success: boolean;
  externalAgentId: string;
  terminatedAt: string;
  resourcesCleaned: boolean;
}>
```

---

## 10. Configuration & Deployment

### Agent Configuration

External agents are created dynamically, so no static configuration needed. However, system defaults can be configured:

**Environment Variables:**
```bash
# External Agent Defaults
EXTERNAL_AGENT_MAX_TOKENS=2000
EXTERNAL_AGENT_DEFAULT_MODEL=claude-haiku
EXTERNAL_AGENT_TERMINATION_TTL_SECONDS=3600
EXTERNAL_AGENT_CONVERSATION_RETENTION_DAYS=30
EXTERNAL_AGENT_CLEANUP_BATCH_SIZE=100
```

### Monitoring & Observability

**Metrics:**
- `external_agent_created_total` — counter, labeled with role
- `external_agent_terminated_total` — counter, labeled with reason
- `external_agent_active_count` — gauge
- `external_agent_message_latency_ms` — histogram
- `external_agent_creation_latency_ms` — histogram
- `external_agent_wake_queue_backlog_size` — gauge per agent

**Logs:**
- Creation: `[EXTERNAL_AGENT] Created {externalAgentId} for {creatorAgentId}`
- Termination: `[EXTERNAL_AGENT] Terminated {externalAgentId}, reason: {reason}`
- Error: `[EXTERNAL_AGENT_ERROR] {externalAgentId}: {error}`

**Audit Trail:**
All events logged to `forge_external_agent_audit_log` with full context.

---

## 11. Testing Strategy

### Unit Tests

**External Agent Creation:**
- ✅ Valid creation request succeeds with unique ID
- ✅ Invalid system prompt rejected
- ✅ Duplicate names allowed (different IDs)
- ✅ Max token limits enforced
- ✅ Context injection works correctly

**Tool Access Control:**
- ✅ External agents can access only messaging tools
- ✅ Attempting to call internal tools fails gracefully
- ✅ Database access blocked
- ✅ File system access blocked
- ✅ Cross-agent messaging blocked

**Termination:**
- ✅ Only creator can terminate
- ✅ Terminated agents reject new messages
- ✅ Resources cleaned up
- ✅ Audit log entries created

### Integration Tests

**Message Exchange:**
- ✅ Internal → External message delivery
- ✅ External → Internal response handling
- ✅ Conversation thread maintained
- ✅ Wake queue triggers on message

**Lifecycle:**
- ✅ Create → Message → Terminate flow
- ✅ Multiple messages per agent
- ✅ Multiple agents per creator
- ✅ Self-termination via signal

**Persistence:**
- ✅ Conversation history survives restart
- ✅ Audit log complete and accurate
- ✅ Agent metadata consistent

### End-to-End Tests

**Scenario: Persona Interview**
1. Create "Candidate Persona" external agent
2. Send interview questions (10+ messages)
3. Verify responses stay in character
4. Terminate agent
5. Verify conversation archived + audit logged

**Scenario: Expert Consultation**
1. Create 3 external experts (data scientist, architect, ethicist)
2. Send same question to each
3. Collect responses
4. Verify no cross-agent communication
5. Terminate all 3
6. Verify resource cleanup

**Scenario: Research Assistant**
1. Create research assistant with termination signal
2. Send research tasks
3. External agent self-terminates on signal
4. Verify termination logged
5. Verify cleanup happened

---

## 12. Risks & Mitigation

| Risk | Mitigation |
| --- | --- |
| **Security Breach** | Tool filtering at creation; runtime validation |
| **Resource Leak** | Explicit cleanup of terminated agents |
| **Message Backlog** | Async message delivery with timeouts |

---

## 13. Future Enhancements

### Short Term (1-2 Sprints)
- [ ] Self-termination via signal strings (e.g., "TASK_COMPLETE")
- [ ] Conversation export (JSON/markdown) after termination
- [ ] Metrics dashboard for external agent activity
- [ ] Template library for common roles (engineer, analyst, qa, etc.)

### Medium Term (2-3 Sprints)
- [ ] Multi-party conversations (multiple external agents + creator)
- [ ] External agent memory access to sanitized creator memory
- [ ] Tool whitelisting (external agents can call approved tools)
- [ ] Scheduled termination (auto-terminate after N hours)
- [ ] Cost tracking per external agent instance

### Long Term (3+ Sprints)
- [ ] Nested external agents (external agent creates another external agent)
- [ ] Persistent external agent roles (reusable templates)
- [ ] Approval workflows for external agent creation
- [ ] GraphQL API for external agent management
- [ ] Web UI for external agent orchestration
- [ ] Integration with external services (APIs available to specific external agents)

---

## Appendix A: Example: Persona Interview Workflow

```typescript
// Internal recruiting agent
const recruiterAgent = await createAgent({
  id: 'recruiter-001',
  instructions: 'You are a technical recruiter...',
  model: 'claude-opus',
});

// 1. Create candidate persona
const candidateResponse = await recruiterAgent.tool('createExternalAgent', {
  name: 'Alex Chen',
  role: 'senior_engineer_candidate',
  systemPrompt: `You are Alex Chen, a Senior Software Engineer with 8 years of experience.
    Background: Led infrastructure team at startup, expert in Rust and distributed systems.
    Personality: Direct, curious, thoughtful. Ask clarifying questions.
    Boundaries: You do not have access to company internal data or systems.
    End your responses naturally; do not signal completion.`,
  context: 'This is a technical interview for Senior Engineer role at TechCorp.'
});

const externalAgentId = candidateResponse.externalAgentId;

// 2. Conduct interview (send questions, collect answers)
const responses = [];

const q1Response = await recruiterAgent.tool('sendMessageToExternalAgent', {
  externalAgentId,
  content: 'Tell me about your most challenging project and what you learned.'
});

// Retrieve response
const messages1 = await recruiterAgent.tool('getExternalAgentMessages', {
  externalAgentId,
  limit: 10
});
responses.push(messages1.messages[messages1.messages.length - 1]);

// ... more questions ...

const q5Response = await recruiterAgent.tool('sendMessageToExternalAgent', {
  externalAgentId,
  content: 'Final question: Why are you interested in this role?'
});

const messagesFinal = await recruiterAgent.tool('getExternalAgentMessages', {
  externalAgentId,
  limit: 50
});

// 3. Terminate and analyze
await recruiterAgent.tool('terminateExternalAgent', {
  externalAgentId,
  reason: 'Interview concluded'
});

// Analyze responses
const analysis = recruiterAgent.analyze(messagesFinal.messages);
// "Candidate demonstrates strong systems thinking, asked insightful questions,
//  clear communication. Recommend for technical screen."
```

---

## Appendix B: Example: Multi-Expert Evaluation

```typescript
// Internal research agent
const researchAgent = await createAgent({
  id: 'research-001',
  instructions: 'You are a research coordinator...',
  model: 'claude-opus',
});

// Create three external expert agents
const experts = await Promise.all([
  researchAgent.tool('createExternalAgent', {
    name: 'Dr. Data Scientist',
    role: 'data_scientist',
    systemPrompt: 'You are a data scientist expert...'
  }),
  researchAgent.tool('createExternalAgent', {
    name: 'Ethics Expert',
    role: 'ethics_expert',
    systemPrompt: 'You are an ethics expert...'
  }),
  researchAgent.tool('createExternalAgent', {
    name: 'Architect Expert',
    role: 'architect',
    systemPrompt: 'You are a systems architect expert...'
  })
]);

const problem = `We are considering using large language models in our customer support system.
  What are the key considerations, risks, and opportunities?`;

// Send problem to each expert (sanitized, no internal data)
const expertResponses = await Promise.all(
  experts.map(expert =>
    researchAgent.tool('sendMessageToExternalAgent', {
      externalAgentId: expert.externalAgentId,
      content: problem
    })
  )
);

// Collect expert perspectives
const perspectives = await Promise.all(
  experts.map(expert =>
    researchAgent.tool('getExternalAgentMessages', {
      externalAgentId: expert.externalAgentId,
      limit: 20
    })
  )
);

// Terminate all experts
await Promise.all(
  experts.map(expert =>
    researchAgent.tool('terminateExternalAgent', {
      externalAgentId: expert.externalAgentId,
      reason: 'Evaluation phase complete'
    })
  )
);

// Synthesize insights from all three experts
const synthesis = researchAgent.synthesize(perspectives);
```

---

**Document Version:** 1.0
**Last Review:** 2026-03-15
**Next Review:** 2026-04-15
