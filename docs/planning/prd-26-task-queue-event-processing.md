# PRD — Task Queue & Event Processing

**Feature**: Task Queue & Event Processing
**Version**: 1.0
**Status**: In Analysis & Planning
**Last Updated**: 2026-03-15

---

## 1. Executive Summary

This PRD outlines the implementation of a robust task queue and event processing system to enable asynchronous task execution and event-driven workflows within the ad-product-forge platform. Currently, agents execute work synchronously with limited ability to queue tasks or respond to events. This feature introduces job queuing via BullMQ, workflow orchestration via trigger.dev, and event-driven processing capabilities.

**Core Objective**: Enable agents to enqueue long-running tasks, execute them asynchronously, and react to system events in a scalable, resilient manner.

---

## 2. Vision & Strategic Context

### 2.1 Vision Statement
Build a distributed task execution infrastructure where agents can defer work to reliable job queues, orchestrate complex multi-step workflows, and respond to business events without blocking synchronous operations.

### 2.2 Strategic Alignment
This feature is foundational for:
- **External Agent System** (Section 2.1 of ROADMAP): Specialist agents need async task execution for remote work
- **Webhook Event Routing** (Section 5.3 of ROADMAP): Event processing requires task queues to handle spikes
- **Cron Scheduling System** (Section 4.4 of ROADMAP): Scheduled tasks must enqueue work asynchronously
- **Agent Hiring Workflow** (Section 4.1 of ROADMAP): Onboarding involves background job orchestration
- **External Specialist Agents** (Section 2.1 of ROADMAP): Delegation patterns require job queues

---

## 3. Problem Statement

### 3.1 Current State
- **Agent execution model**: Primarily synchronous with limited ability to defer work
- **No job queuing**: Long-running tasks block agents; no retry or failure recovery mechanisms
- **No workflow orchestration**: Complex multi-step processes lack coordination primitives
- **Event handling**: Reactive patterns require polling or tight coupling to event sources
- **Scalability bottleneck**: High-volume task execution can overwhelm synchronous request handling

### 3.2 User Needs
- **Defer long-running work**: Fire-and-forget task execution without blocking agent loops
- **Reliable retry logic**: Automatic retry on transient failures with exponential backoff
- **Complex workflow coordination**: Chain tasks, wait for results, handle failures
- **Event-driven reactivity**: Respond to system/external events through queue-based handlers
- **Task visibility and monitoring**: Track job status, failures, and performance metrics

---

## 4. Objectives & Success Metrics

### 4.1 Primary Objectives
1. **Integrate BullMQ** as the core job queue system for reliable task persistence and execution
2. **Enable trigger.dev integration** for workflow orchestration and multi-step job chains
3. **Provide agent-facing API** for task enqueueing, retrieval, and event subscriptions
4. **Support application-scoped and shared queues** for flexible resource management
5. **Implement event-driven processing** to trigger task execution on external/internal events

### 4.2 Success Metrics
| Metric | Target | Rationale |
|---|---|---|
| Task enqueue latency | <50ms | Performance: fast job creation |
| Task execution reliability | 99.9% success rate (with retries) | Reliability: minimal data loss |
| Job retry attempts | 3-5 configurable | Resilience: reasonable retry budget |
| Event processing latency | <500ms | Reactivity: timely event handling |
| Queue monitoring uptime | 99.95% | Operational: queue health visibility |
| Scalability: jobs per queue | ≥10,000 concurrent | Scale: handle enterprise workloads |

---

## 5. Functional Requirements

### 5.1 Task Queue Entity Model

#### 5.1.1 Queue Definition Schema
```
Queue {
  queueId: UUID                    // Internal unique identifier
  applicationId: string            // Owner application (or null for shared)
  name: string                     // Queue name (e.g., "email-delivery", "data-export")
  type: "application" | "shared"   // Scope: app-specific or shared
  concurrency: number              // Max concurrent workers (default: 5)
  retryPolicy: RetryPolicy         // Retry configuration
  createdAt: ISO8601              // Creation timestamp
  updatedAt: ISO8601              // Last modification timestamp
  isActive: boolean               // Queue operational status
  metadata?: Record<string,any>   // Custom configuration
}

RetryPolicy {
  maxRetries: number               // Max retry attempts (default: 3)
  backoffType: "fixed" | "exponential" // Retry strategy
  backoffDelay: number            // Initial delay in ms (default: 1000)
  backoffMultiplier?: number      // Exponential multiplier (default: 2)
}
```

#### 5.1.2 Job Schema
```
Job {
  jobId: UUID                      // Globally unique job identifier
  queueId: UUID                    // Which queue this job belongs to
  type: string                     // Job type (e.g., "send-email", "process-csv")
  payload: Record<string,any>      // Job parameters
  status: "pending" | "processing" | "completed" | "failed" | "canceled"
  priority: number                 // 1-10 (default: 5)
  attempts: number                 // Current attempt count
  maxAttempts: number              // Max attempts allowed
  result?: Record<string,any>      // Job output (on completion)
  error?: string                   // Error message (on failure)
  createdAt: ISO8601              // When job was created
  startedAt?: ISO8601             // When processing began
  completedAt?: ISO8601           // When job finished/failed
  nextRetryAt?: ISO8601           // Scheduled retry time
  tags?: string[]                 // Job categorization (e.g., ["email", "priority"])
}
```

#### 5.1.3 Event Schema
```
Event {
  eventId: UUID                    // Unique event identifier
  source: string                   // Event origin (e.g., "webhook.stripe", "agent.task")
  type: string                     // Event type (e.g., "payment.completed", "task.queued")
  payload: Record<string,any>      // Event data
  correlationId?: string          // Link related events
  timestamp: ISO8601              // Event occurrence time
  processed: boolean              // Whether this triggered handlers
  metadata?: Record<string,any>   // Additional context
}

EventSubscription {
  subscriptionId: UUID             // Unique subscription identifier
  applicationId?: string          // Owner app (or null for platform-wide)
  eventType: string               // Pattern: "payment.*" or exact "payment.completed"
  handlerQueue: string            // Which queue receives jobs from this event
  isActive: boolean               // Subscription status
  createdAt: ISO8601             // When subscription created
}
```

### 5.2 Agent-Facing API

#### 5.2.1 Queue Management Tools

**listQueues()**
```typescript
listQueues(input?: {
  limit?: number;                 // Default: 100
  offset?: number;               // Default: 0
  scope?: "application" | "shared" | "all"; // Default: "all"
}): Promise<Array<{
  queueId: string;
  name: string;
  type: "application" | "shared";
  concurrency: number;
  jobCount: number;              // Pending + processing jobs
  failedCount: number;           // Recently failed jobs
  createdAt: string;
}>>
```

**getQueue(queueId)**
```typescript
getQueue(queueId: string): Promise<{
  queueId: string;
  name: string;
  type: "application" | "shared";
  concurrency: number;
  retryPolicy: {
    maxRetries: number;
    backoffType: string;
    backoffDelay: number;
  };
  stats: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  createdAt: string;
}>
```

**createQueue(input)**
```typescript
createQueue(input: {
  name: string;                  // Required
  type?: "application" | "shared"; // Default: "application"
  concurrency?: number;          // Default: 5
  retryPolicy?: {
    maxRetries?: number;         // Default: 3
    backoffType?: "fixed" | "exponential"; // Default: "exponential"
    backoffDelay?: number;       // Default: 1000
    backoffMultiplier?: number;  // Default: 2
  };
}): Promise<{
  queueId: string;
  name: string;
  createdAt: string;
}>
```

#### 5.2.2 Job Management Tools

**enqueueJob(input)**
```typescript
enqueueJob(input: {
  queueId: string;               // Which queue
  type: string;                  // Job type identifier
  payload: Record<string,any>;   // Job parameters
  priority?: number;             // 1-10, default: 5
  maxAttempts?: number;          // Override queue default
  tags?: string[];              // Optional categorization
  delayMs?: number;             // Schedule for later (ms)
}): Promise<{
  jobId: string;
  queueId: string;
  status: "pending";
  createdAt: string;
}>
```

**getJob(jobId)**
```typescript
getJob(jobId: string): Promise<{
  jobId: string;
  queueId: string;
  type: string;
  status: "pending" | "processing" | "completed" | "failed" | "canceled";
  payload: Record<string,any>;
  result?: Record<string,any>;
  error?: string;
  attempts: number;
  maxAttempts: number;
  progress?: number;             // 0-100 if supported
  createdAt: string;
  completedAt?: string;
}>
```

**listJobs(queueId)**
```typescript
listJobs(input: {
  queueId: string;
  status?: "pending" | "processing" | "completed" | "failed" | "canceled";
  limit?: number;               // Default: 100
  offset?: number;              // Default: 0
}): Promise<Array<{
  jobId: string;
  type: string;
  status: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  completedAt?: string;
}>>
```

**cancelJob(jobId)**
```typescript
cancelJob(jobId: string): Promise<{
  success: boolean;
  jobId: string;
  previousStatus: string;
}>
```

**retryJob(jobId)**
```typescript
retryJob(jobId: string): Promise<{
  success: boolean;
  jobId: string;
  newStatus: "pending";
  nextAttempt: number;
}>
```

#### 5.2.3 Event Processing Tools

**subscribeToEvent(input)**
```typescript
subscribeToEvent(input: {
  eventType: string;             // Pattern: "payment.*" or exact type
  targetQueueId: string;         // Queue to enqueue jobs
  jobTemplate?: {
    type?: string;              // Default: same as eventType
    priority?: number;          // Default: 5
  };
}): Promise<{
  subscriptionId: string;
  eventType: string;
  targetQueue: string;
  createdAt: string;
}>
```

**unsubscribeFromEvent(subscriptionId)**
```typescript
unsubscribeFromEvent(subscriptionId: string): Promise<{
  success: boolean;
  subscriptionId: string;
}>
```

**listSubscriptions(input?)**
```typescript
listSubscriptions(input?: {
  eventType?: string;            // Filter by event type pattern
  limit?: number;               // Default: 100
}): Promise<Array<{
  subscriptionId: string;
  eventType: string;
  targetQueueId: string;
  isActive: boolean;
  createdAt: string;
}>>
```

**publishEvent(input)**
```typescript
publishEvent(input: {
  source: string;                // Event source identifier
  type: string;                 // Event type
  payload: Record<string,any>;  // Event data
  correlationId?: string;       // Optional correlation ID
}): Promise<{
  eventId: string;
  type: string;
  source: string;
  matchedSubscriptions: number;  // How many subscriptions triggered
  timestamp: string;
}>
```

### 5.3 Data Persistence

#### 5.3.1 New Tables (Task Queue Store)

**forge_task_queues**
```
CREATE TABLE forge_task_queues (
  queue_id TEXT PRIMARY KEY,
  application_id TEXT,           -- NULL for shared queues
  name TEXT NOT NULL,
  type TEXT NOT NULL,            -- "application" or "shared"
  concurrency INTEGER DEFAULT 5,
  retry_max_retries INTEGER DEFAULT 3,
  retry_backoff_type TEXT DEFAULT 'exponential',
  retry_backoff_delay INTEGER DEFAULT 1000,
  retry_backoff_multiplier REAL DEFAULT 2.0,
  is_active BOOLEAN DEFAULT true,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata TEXT,                 -- JSON blob
  UNIQUE(application_id, name),
  FOREIGN KEY (application_id) REFERENCES forge_applications(application_id)
);
```

**forge_task_jobs**
```
CREATE TABLE forge_task_jobs (
  job_id TEXT PRIMARY KEY,
  queue_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  priority INTEGER DEFAULT 5,
  payload TEXT NOT NULL,         -- JSON
  result TEXT,                   -- JSON (on completion)
  error TEXT,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  next_retry_at TEXT,
  tags TEXT,                     -- JSON array
  FOREIGN KEY (queue_id) REFERENCES forge_task_queues(queue_id),
  INDEX idx_queue_status (queue_id, status),
  INDEX idx_created_at (created_at),
  INDEX idx_next_retry_at (next_retry_at)
);
```

**forge_task_events**
```
CREATE TABLE forge_task_events (
  event_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,         -- JSON
  correlation_id TEXT,
  timestamp TEXT NOT NULL,
  processed BOOLEAN DEFAULT false,
  metadata TEXT,                 -- JSON
  UNIQUE(event_id),
  INDEX idx_source_type (source, type),
  INDEX idx_timestamp (timestamp)
);
```

**forge_task_event_subscriptions**
```
CREATE TABLE forge_task_event_subscriptions (
  subscription_id TEXT PRIMARY KEY,
  application_id TEXT,           -- NULL for platform-wide
  event_type TEXT NOT NULL,      -- Can be pattern: "payment.*"
  handler_queue_id TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TEXT NOT NULL,
  FOREIGN KEY (handler_queue_id) REFERENCES forge_task_queues(queue_id),
  FOREIGN KEY (application_id) REFERENCES forge_applications(application_id),
  INDEX idx_event_type (event_type),
  INDEX idx_application (application_id)
);
```

#### 5.3.2 BullMQ Integration

- **Storage**: BullMQ stores job data in Redis (separate from LibSQL)
- **Persistence strategy**:
  - Redis for high-frequency reads/updates (job status, progress)
  - LibSQL for audit trail, historical data, event records
- **Sync mechanism**:
  - Job lifecycle events (created, started, completed, failed) synced to LibSQL
  - Enables agent queries without Redis dependency

---

## 6. Technical Architecture

### 6.1 System Components

```
Task Queue System
├─ Queue Manager (BullMQ)
│  ├─ Queue creation and configuration
│  ├─ Job persistence in Redis
│  ├─ Worker pool management
│  ├─ Retry orchestration
│  └─ Dead-letter queue handling
├─ Workflow Orchestrator (trigger.dev)
│  ├─ Multi-step job chains
│  ├─ Conditional workflows
│  ├─ Parallel job execution
│  ├─ Timeout and circuit-breaker handling
│  └─ Webhook integration
├─ Event Processing Engine
│  ├─ Event ingestion and routing
│  ├─ Subscription matching (pattern-based)
│  ├─ Job triggering from events
│  └─ Dead-letter queue for unmatched events
├─ Agent-Facing API
│  ├─ Task enqueueing tools
│  ├─ Job status/retrieval tools
│  ├─ Event subscription tools
│  └─ Queue management tools
└─ Monitoring & Observability
   ├─ Queue health metrics
   ├─ Job execution logs
   ├─ Event processing metrics
   └─ Alert triggers
```

### 6.2 Message Flow — Job Enqueueing

```
Agent.enqueueJob({ queueId, type, payload })
  ↓
TaskQueueManager.enqueueJob()
  ├─ Validate queue exists and is active
  ├─ Create Job entity in LibSQL
  ├─ Push to BullMQ (Redis)
  ├─ Trigger worker if available
  └─ Return jobId + status
```

### 6.3 Message Flow — Job Execution

```
BullMQ Worker processes job
  ↓
1. Fetch job payload
2. Execute job handler
3. Update job status in BullMQ + LibSQL
4. On success:
   │  ├─ Store result in LibSQL
   │  └─ Publish "job.completed" event
5. On failure:
   │  ├─ Store error in LibSQL
   │  ├─ Evaluate retry policy
   │  ├─ If retries available: reschedule with backoff
   │  └─ Otherwise: move to dead-letter queue, publish "job.failed" event
```

### 6.4 Message Flow — Event-Driven Job Creation

```
External/Internal Event
  ↓
publishEvent({ source, type, payload })
  ↓
EventRouter.routeEvent()
  ├─ Find matching subscriptions (pattern matching on type)
  ├─ For each subscription:
  │  ├─ Create job from event payload
  │  ├─ Enqueue to target queue
  │  └─ Log subscription match
  ├─ Update event.processed = true
  └─ Publish "event.processed" event
```

### 6.5 Integration with Existing Systems

**Communication Module**:
- Task status updates sent as messages (optional)
- Event subscriptions can target internal groups

**Webhook System** (Section 5.3 ROADMAP):
- Webhook payloads automatically enqueue jobs
- Event publishing can trigger webhooks
- Bidirectional routing

**Cron Scheduling** (Section 4.4 ROADMAP):
- Scheduled jobs enqueue to task queues
- No direct cron execution; all work deferred

**External Agents** (Section 2.1 ROADMAP):
- Long-running external API calls enqueued
- Results retrieved asynchronously
- Enables timeout and retry handling

---

## 7. Implementation Roadmap

### 7.1 Phase 1: Queue Infrastructure (Sprint 1–2)

**Deliverables**:
- [ ] BullMQ dependency and Redis connection setup
- [ ] Database tables: `forge_task_queues`, `forge_task_jobs`
- [ ] Queue CRUD operations: `createQueue()`, `getQueue()`, `listQueues()`
- [ ] Job CRUD operations: `enqueueJob()`, `getJob()`, `listJobs()`
- [ ] Basic job worker and retry logic
- [ ] Job lifecycle syncing to LibSQL

**Success Criteria**:
- Jobs successfully enqueue and process
- Retry policy applied correctly
- No data loss on queue failures
- Job status consistent in Redis and LibSQL

### 7.2 Phase 2: Event Processing (Sprint 2–3)

**Deliverables**:
- [ ] Database tables: `forge_task_events`, `forge_task_event_subscriptions`
- [ ] Event ingestion: `publishEvent()` tool
- [ ] Event routing: pattern matching on event types
- [ ] Subscription management: `subscribeToEvent()`, `unsubscribeFromEvent()`
- [ ] Event-to-job creation pipeline
- [ ] Dead-letter queue for unmatched events

**Success Criteria**:
- Events route to correct subscriptions
- Jobs created from events appear in target queue
- Pattern matching works (wildcard support)
- No event loss

### 7.3 Phase 3: Workflow Orchestration (Sprint 3–4)

**Deliverables**:
- [ ] trigger.dev integration setup
- [ ] Multi-step job chains (A → B → C sequences)
- [ ] Conditional workflows (if/else branching)
- [ ] Parallel job execution and wait patterns
- [ ] Timeout and circuit-breaker support
- [ ] Webhook callbacks to trigger.dev

**Success Criteria**:
- Complex workflows execute end-to-end
- Results flow between jobs correctly
- Failures handled gracefully
- Logs available for debugging

### 7.4 Phase 4: Agent API & Monitoring (Sprint 4–5)

**Deliverables**:
- [ ] All agent-facing tools fully implemented
- [ ] Queue health monitoring dashboard
- [ ] Job execution metrics and logs
- [ ] Alert configuration for failures
- [ ] API documentation and examples
- [ ] Integration tests (end-to-end)

**Success Criteria**:
- 90%+ code coverage
- Monitoring shows accurate metrics
- Agents can query all job/queue information
- Documentation complete

---

## 8. Detailed Requirements & Constraints

### 8.1 Functional Requirements

| Req ID | Requirement | Priority | Notes |
|---|---|---|---|
| F1 | Create application-scoped queues | MUST | Via `createQueue()` tool |
| F2 | Enqueue jobs with priority and retry policy | MUST | Via `enqueueJob()` |
| F3 | Execute jobs with configurable concurrency | MUST | BullMQ worker pool |
| F4 | Retry failed jobs with exponential backoff | MUST | Configurable per queue |
| F5 | Cancel pending/processing jobs | SHOULD | Via `cancelJob()` |
| F6 | Retrieve job status and results | MUST | Via `getJob()` |
| F7 | Create event subscriptions (pattern-based) | MUST | Via `subscribeToEvent()` |
| F8 | Automatically enqueue jobs from events | MUST | Event router integration |
| F9 | Support multi-step workflows via trigger.dev | SHOULD | Phase 3 |
| F10 | Query queue statistics and job history | MUST | Via `listQueues()`, `listJobs()` |

### 8.2 Non-Functional Requirements

| Req ID | Requirement | Target | Constraint |
|---|---|---|---|
| NFR1 | Job enqueue latency | <50ms | Synchronous Redis write |
| NFR2 | Job execution reliability | 99.9% | With retries, no data loss |
| NFR3 | Event routing latency | <500ms | Subscription matching |
| NFR4 | Queue scalability | ≥10,000 concurrent jobs | Per queue, tested load |
| NFR5 | Job retention | ≥7 days | Configurable TTL |
| NFR6 | Backward compatibility | 100% | No breaking agent API changes |
| NFR7 | Redis availability | 99.95% | Separate cluster from cache |
| NFR8 | Monitoring query latency | <200ms | Dashboard responsiveness |

### 8.3 Job Execution Guarantees

**Exactly-once semantics**:
- Jobs processed at least once (retries may cause duplicates)
- Idempotent job handlers required for safety
- Job ID enables deduplication at application level

**Failure handling**:
- Transient failures: retry with backoff
- Permanent failures: move to dead-letter queue
- Timeout: after 60 seconds (configurable per job)
- Missing handler: fail immediately, log error

### 8.4 Event Processing Semantics

**Event routing**:
- Pattern matching on event type (supports wildcards: `payment.*`)
- Multiple subscriptions per event type allowed
- Event firing doesn't guarantee job execution (async)

**Event deduplication**:
- Events tracked by `eventId` (UUID)
- Duplicate events within 1 hour are deduplicated
- Correlation IDs link related events

### 8.5 Authorization & Permissions

**Queue access**:
- Application-scoped queues: only owning application's agents
- Shared queues: accessible to any agent (platform-wide)
- Future: role-based queue permissions (Section 3.1 ROADMAP)

**Event subscriptions**:
- Application-scoped: agent can subscribe to own app's events
- Platform events: any agent can subscribe to published events

---

## 9. Use Cases & User Stories

### 9.1 Use Case: Long-Running Email Campaign

```
Scenario: A marketing agent needs to send emails to 10,000 contacts.
The agent enqueues individual email jobs instead of blocking
on 10,000 synchronous sends.

Flow:
1. marketing_agent calls createQueue({ name: "email-delivery" })
2. Loop: for each contact, call enqueueJob({ queueId, type: "send-email", payload: {...} })
3. BullMQ workers process emails at configured concurrency (e.g., 50 parallel)
4. marketing_agent polls getJob() or subscribes to "email.sent" events
5. On failure (bounced email), job retries with exponential backoff (max 3 times)
6. Failed jobs move to dead-letter queue for manual review
```

**User Story**:
> As a marketing agent, I want to enqueue email jobs
> so that I can send campaigns at scale without blocking.

### 9.2 Use Case: Event-Triggered Data Export

```
Scenario: When a user signs up (webhook event), trigger automatic
data export and notification to analysis team.

Flow:
1. platform creates "user.signed_up" event from webhook
2. data_export_agent subscribed: subscribeToEvent({
     eventType: "user.signed_up",
     targetQueue: "export-queue"
   })
3. publishEvent({ type: "user.signed_up", payload: { userId: "123" } })
4. Event router creates job in "export-queue"
5. BullMQ worker exports user data to S3
6. On completion, publishEvent({ type: "user.data_exported", ... })
7. analysis_agent receives event, publishes results
```

**User Story**:
> As a data agent, I want to automatically export data
> when users sign up so that the analysis team has fresh data.

### 9.3 Use Case: Complex Multi-Step Workflow

```
Scenario: A fulfillment agent orchestrates order processing:
1. Validate order
2. Reserve inventory
3. Generate shipping label
4. Notify customer (parallel with #3)
5. Update accounting system

Flow:
1. order_agent calls enqueueJob({ type: "validate-order", ... })
   (via trigger.dev workflow definition)
2. trigger.dev chains jobs: validate → reserve → [shipping + notify] → accounting
3. On any step failure: rollback and notify order_agent via event
4. On completion: order_agent retrieves full workflow result
```

**User Story**:
> As an order fulfillment agent, I want to orchestrate
> multi-step order processing so that orders complete reliably.

### 9.4 Use Case: Agent Self-Scheduling (Cron Integration)

```
Scenario: A scheduled task enqueues jobs to a queue instead of
running synchronously.

Flow:
1. scheduler creates cron: "daily data cleanup"
2. At trigger time, publishEvent({ type: "cron.daily-cleanup" })
3. data_agent subscribed to "cron.*"
4. Event triggers job: enqueueJob({ type: "cleanup-cache" })
5. BullMQ worker executes cleanup
6. Job completion triggers follow-up event: "cleanup.completed"
7. scheduler receives event, logs result
```

**User Story**:
> As a scheduler, I want cron tasks to enqueue work
> so that jobs are resilient to failures and retryable.

---

## 10. Risk Analysis & Mitigation

### 10.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|---|---|---|---|
| **Redis unavailability** | Jobs cannot queue/process | Medium | Separate Redis cluster; failover setup; queue backlog to LibSQL |
| **Job handler errors** | Silent failures; no retry | Medium | Structured error handling; try-catch + logging in every handler; alerting |
| **Event storm** | Queue backlog; processing delays | Medium | Rate limiting on event subscriptions; priority queues; topic-specific concurrency caps |
| **Duplicate job execution** | Data inconsistency | Low | Idempotent handlers required; client deduplication via jobId |
| **Long-running job timeout** | Job cancellation mid-execution | Medium | Configurable timeout; graceful shutdown; cleanup handlers |

### 10.2 Operational Risks

| Risk | Impact | Probability | Mitigation |
|---|---|---|---|
| **Queue deadlock** | Jobs stuck pending | Low | Deadlock detection; alert on age > 1 hour; manual intervention |
| **Storage exhaustion** | New jobs fail to enqueue | Low | TTL-based cleanup; archive old jobs to cold storage; capacity planning |
| **Unmatched events** | Silent event loss | Medium | Dead-letter queue; DLQ monitoring; fallback handlers |
| **Cascading failures** (one failed job blocks chain) | Workflow halts | Medium | Circuit breakers; skip-on-error patterns; compensating transactions |

### 10.3 Scope Risks

| Risk | Item | Mitigation |
|---|---|---|
| **Feature creep** | Job graphs, dynamic workflows, custom DSLs | Define MVP: linear chains only; defer graph support to Phase 4 |
| **Compliance complexity** | GDPR data cleanup, audit logs | Use existing audit system; define retention per job type |
| **External dependency** | trigger.dev availability | Cache workflow definitions; fallback to manual orchestration |

---

## 11. Success Criteria & Acceptance Tests

### 11.1 Functional Acceptance

- [ ] An agent can create a queue with custom retry policy
- [ ] An agent can enqueue a job and retrieve its status
- [ ] A job executes and produces a result
- [ ] Failed jobs retry with exponential backoff
- [ ] An agent can cancel a pending job
- [ ] An agent can subscribe to events and jobs auto-enqueue
- [ ] Pattern-based event matching works (e.g., "payment.*")
- [ ] trigger.dev workflows execute multi-step jobs end-to-end
- [ ] Dead-letter queue captures unprocessable jobs
- [ ] Job history is queryable and searchable

### 11.2 Performance Acceptance

- [ ] Job enqueue completes in <50ms
- [ ] Event routing completes in <500ms
- [ ] Processing 10,000 jobs per hour with 5 workers
- [ ] Querying 10,000 job history items in <200ms
- [ ] Redis memory usage <1GB for 100,000 pending jobs
- [ ] No queue lock contention observed under load

### 11.3 Reliability Acceptance

- [ ] 99.9% of jobs eventually complete or fail (no silently stuck)
- [ ] Retry policy: jobs retry exactly N times (no over/under-retry)
- [ ] Event deduplication: duplicate events don't create duplicate jobs
- [ ] Subscription cleanup: unsubscribed events don't enqueue jobs
- [ ] Database consistency: job status in LibSQL matches Redis
- [ ] No data loss on queue/Redis restart

---

## 12. Dependencies & Integration Points

### 12.1 Internal Dependencies

| Component | Dependency | Risk | Mitigation |
|---|---|---|---|
| **Redis** | Job storage, worker coordination | Medium | Separate Redis cluster; replication/failover; monitored |
| **LibSQL** | Audit trail, job history, events | Low | Existing system; extensible schema |
| **trigger.dev** | Workflow orchestration | Medium | API documented; webhooks for integration; fallback to direct BullMQ |
| **Agent Tools System** | Register queue/job/event tools | Low | Standard tool registration; no API changes |
| **Webhook System** (Section 5.3 ROADMAP) | Event ingestion | Medium | Bidirectional; webhooks → events → jobs |
| **Communication Module** | Status updates via messages | Low | Optional; graceful degradation if unavailable |

### 12.2 External Dependencies

- **BullMQ**: Open-source job queue (Node.js/TS ecosystem)
- **trigger.dev**: Workflow orchestration SaaS (API integration)
- **Redis**: In-memory data store (must be deployed/managed)

---

## 13. Open Questions & Future Considerations

### 13.1 Open Questions (to resolve before Phase 1)

1. **Redis topology**: Single instance, cluster, or managed service (e.g., AWS ElastiCache)?
   - **Decision needed**: Production deployment strategy
   - **Impact**: Failover, scaling, cost

2. **Dead-letter queue capacity**: How long to retain failed jobs?
   - **Current assumption**: 7 days (configurable)
   - **Validation needed**: Retention vs. storage cost tradeoff

3. **trigger.dev vs. custom orchestration**: Build workflows in trigger.dev or maintain YAML DSL?
   - **Current decision**: trigger.dev for Phase 3 (more features)
   - **Alternative**: BullMQ workers + chaining (simpler, less powerful)

4. **Event schema versioning**: How to handle event payload changes over time?
   - **Current assumption**: Event source is responsible; subscriptions use path expressions
   - **Future**: Schema registry (Phase 4+)

### 13.2 Future Extensions (Post-MVP)

- **Job progress tracking**: Update job progress (0-100%) during execution
- **Webhook callbacks**: Job completion triggers external webhooks
- **Time-based scheduling**: Schedule job execution at specific time
- **Batch job processing**: Enqueue multiple jobs atomically
- **Job graphs**: Define complex DAG dependencies between jobs
- **Custom event schema**: Schema validation on event payloads
- **Rate limiting**: Per-queue, per-agent, per-job-type rate limits
- **Cost tracking**: Monitor job execution cost (duration × resources)
- **Job prioritization**: Preempt lower-priority jobs for higher-priority ones
- **Multi-region support**: Distribute queues across geographic regions
- **Integration with workflow tools**: Zapier, Make.com, n8n connectors

---

## 14. Success Timeline & Delivery Plan

| Phase | Duration | Key Deliverables | Readiness Gate |
|---|---|---|---|
| **Phase 1: Queue Infrastructure** | 2 weeks | BullMQ, Redis, job CRUD, retry logic | All jobs queue/process correctly |
| **Phase 2: Event Processing** | 2 weeks | Event tables, subscriptions, routing, DLQ | Events trigger jobs reliably |
| **Phase 3: Workflow Orchestration** | 2 weeks | trigger.dev integration, job chains, conditionals | Multi-step workflows execute |
| **Phase 4: Agent API & Monitoring** | 1 week | Tools, monitoring, docs, integration tests | 90%+ coverage, agents can query |
| **Total MVP** | **7 weeks** | Shipping-ready task queue system | Ready for production agents |

---

## Appendix A: Schema Diagrams

### Task Queue System Tables

```
Core Tables:
  ├─ forge_task_queues
  │  └─ (queue_id, application_id, name, type, concurrency, retry_policy)
  ├─ forge_task_jobs
  │  └─ (job_id, queue_id, type, status, payload, result, error, attempts, timestamps)
  ├─ forge_task_events
  │  └─ (event_id, source, type, payload, correlation_id, timestamp, processed)
  └─ forge_task_event_subscriptions
     └─ (subscription_id, application_id, event_type, handler_queue_id)

Redis Storage (BullMQ):
  ├─ queue:{queueId}
  │  └─ Pending, processing, completed, failed job sets
  ├─ job:{jobId}
  │  └─ Job payload, progress, state
  └─ worker:*
     └─ Active worker heartbeats
```

### Entity Relationships

```
Queue (1) ──── (N) Job
  │              └─ Status tracking
  └─ (1) ──── (N) EventSubscription
              └─ Handler routing

Event (1) ──── (N) EventSubscription (pattern matching)
  │
  └─ Triggers Job creation
```

---

## Appendix B: API Examples

### Example 1: Enqueue Email Campaign

```typescript
// Create queue for email delivery
const queueRes = await taskQueue.createQueue({
  name: "email-delivery",
  concurrency: 50,
  retryPolicy: {
    maxRetries: 3,
    backoffType: "exponential",
    backoffDelay: 1000
  }
});
const emailQueueId = queueRes.queueId;

// Enqueue 10,000 email jobs
for (const contact of contacts) {
  await taskQueue.enqueueJob({
    queueId: emailQueueId,
    type: "send-email",
    payload: {
      to: contact.email,
      subject: "Q2 Campaign",
      templateId: "campaign-2026-q2"
    },
    priority: contact.isPremium ? 9 : 5
  });
}

// Check progress
const emailJobs = await taskQueue.listJobs({
  queueId: emailQueueId,
  status: "pending"
});
console.log(`${emailJobs.length} emails pending...`);

// Subscribe to completion
await taskQueue.subscribeToEvent({
  eventType: "email.sent",
  targetQueueId: "notification-queue"
});
```

### Example 2: Event-Driven Data Export

```typescript
// Subscribe to user signup events
const sub = await taskQueue.subscribeToEvent({
  eventType: "user.signed_up",
  targetQueueId: exportQueueId,
  jobTemplate: {
    type: "export-user-data",
    priority: 8
  }
});

// When user signs up (webhook)
await taskQueue.publishEvent({
  source: "webhook.user-service",
  type: "user.signed_up",
  payload: {
    userId: "user-123",
    email: "alice@example.com",
    timestamp: new Date().toISOString()
  },
  correlationId: "webhook-456"
});

// Job automatically created and enqueued in exportQueueId
// Worker processes: export data to S3, send notification, etc.
```

### Example 3: Multi-Step Workflow

```typescript
// Define workflow via trigger.dev
const workflow = await triggerDev.defineWorkflow({
  name: "order-fulfillment",
  jobs: [
    {
      id: "validate",
      type: "validate-order",
      timeout: 30_000
    },
    {
      id: "reserve",
      type: "reserve-inventory",
      dependsOn: ["validate"],
      timeout: 60_000
    },
    {
      id: "shipping",
      type: "generate-shipping-label",
      dependsOn: ["reserve"],
      parallel: true
    },
    {
      id: "notify",
      type: "notify-customer",
      dependsOn: ["reserve"],
      parallel: true
    },
    {
      id: "accounting",
      type: "update-accounting",
      dependsOn: ["shipping", "notify"],
      timeout: 120_000
    }
  ]
});

// Enqueue order
const jobId = await taskQueue.enqueueJob({
  queueId: orderQueueId,
  type: "order-fulfillment",
  payload: {
    orderId: "order-789",
    items: [...],
    shippingAddress: {...}
  }
});

// Monitor workflow progress
const job = await taskQueue.getJob(jobId);
console.log(job.result); // { status: "completed", accounting_updated: true }
```

---

## Appendix C: BullMQ & trigger.dev Integration Notes

### BullMQ Key Features Used
- **Job persistence**: Jobs survive queue restart
- **Retry logic**: Built-in exponential backoff with max attempts
- **Concurrency control**: Process N jobs in parallel per queue
- **Priority queues**: High-priority jobs process first
- **Dead-letter queue**: Failed jobs moved after max retries
- **Events**: Job state changes trigger system events

### trigger.dev Integration Points
- **Workflow definition**: YAML or API-based job chains
- **State machine**: Track job states across steps
- **Conditional execution**: If/else branching on job results
- **Webhooks**: Receive callbacks on job completion
- **Error handling**: Retry policies, timeout handling
- **Monitoring**: Built-in logging and metrics

### Redis Cluster Topology (Production)
```
Primary Redis Cluster (3 nodes)
├─ Node 1 (master)
├─ Node 2 (replica)
└─ Node 3 (replica)

BullMQ Config:
  ├─ Connection string: redis-cluster://...
  ├─ Retry strategy: exponential backoff
  └─ Health checks: every 30 seconds
```

---

## Appendix D: Glossary

| Term | Definition |
|---|---|
| **Queue** | A container for jobs of a specific type or application |
| **Job** | A unit of work to be executed asynchronously |
| **Event** | A notification of something that happened (internal or external) |
| **Subscription** | A binding between an event type and a job queue |
| **Worker** | A process that executes jobs from a queue |
| **Retry policy** | Configuration for automatic job retries on failure |
| **Dead-letter queue** | A queue for jobs that failed and exhausted retries |
| **Exactly-once semantics** | Guarantee that a job is processed (at least once) |
| **Idempotent handler** | A job handler that produces the same result on repeat execution |
| **Correlation ID** | A token linking related events across systems |
| **Debounce** | Batching of events to reduce redundant processing |

---

## Document History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-03-15 | Product Analysis | Initial PRD: core requirements, BullMQ/trigger.dev integration, event processing, acceptance criteria |
