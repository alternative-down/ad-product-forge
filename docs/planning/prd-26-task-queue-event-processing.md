# PRD — Task Queue & Event Processing

**Feature**: Task Queue & Event Processing
**Version**: 1.0
**Status**: In Analysis & Planning
**Last Updated**: 2026-03-15
**Scope**: Personal developer project - KISS & YAGNI principles apply

---

## 1. Executive Summary

Enable agents to queue long-running tasks and process events asynchronously using BullMQ for job persistence and Redis for coordination.

**Core Objective**: Allow agents to defer work without blocking, with automatic retries on failure.

---

## 2. Vision & Strategic Context

Build a simple asynchronous task execution system where agents can defer work to job queues without blocking operations.

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
1. **Integrate BullMQ** as job queue for reliable task persistence
2. **Provide agent-facing API** for task enqueueing and status retrieval
3. **Implement event subscriptions** to trigger jobs from events
4. **Support automatic retries** with exponential backoff

### 4.2 Success Metrics
| Metric | Target |
|---|---|
| Task enqueue latency | <100ms |
| Job retry logic works | 3 max attempts |
| Event routing works | Basic pattern matching |

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

**createQueue(input)**
```typescript
createQueue(input: {
  name: string;
  concurrency?: number;          // Default: 5
  maxRetries?: number;           // Default: 3
}): Promise<{ queueId: string; name: string; }>
```

**getQueue(queueId)**
```typescript
getQueue(queueId: string): Promise<{
  queueId: string;
  name: string;
  concurrency: number;
  stats: { pending: number; processing: number; completed: number; failed: number; };
}>
```

**listQueues()** — List all queues

**enqueueJob(input)** — Add job to queue
```typescript
enqueueJob(input: {
  queueId: string;
  type: string;
  payload: Record<string,any>;
  priority?: number;             // 1-10, default: 5
}): Promise<{ jobId: string; }>
```

**getJob(jobId)** — Get job status and result

**listJobs(queueId)** — List jobs in queue

**cancelJob(jobId)** — Cancel pending job

**retryJob(jobId)** — Manually retry failed job

**subscribeToEvent(input)** — Subscribe to events
```typescript
subscribeToEvent(input: {
  eventType: string;             // Exact type or pattern like "payment.*"
  targetQueueId: string;
}): Promise<{ subscriptionId: string; }>
```

**publishEvent(input)** — Publish event to trigger subscriptions
```typescript
publishEvent(input: {
  source: string;
  type: string;
  payload: Record<string,any>;
}): Promise<{ eventId: string; matchedSubscriptions: number; }>
```

**listSubscriptions()** — List active subscriptions

**unsubscribeFromEvent(subscriptionId)** — Remove subscription

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
│  ├─ Queue creation
│  ├─ Job persistence in Redis
│  ├─ Worker pool management
│  └─ Retry orchestration
├─ Event Processing Engine
│  ├─ Event routing
│  ├─ Subscription matching (pattern-based)
│  └─ Job triggering from events
└─ Agent-Facing API
   ├─ Task enqueueing tools
   ├─ Job status/retrieval tools
   └─ Event subscription tools
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

### Phase 1: Queue Infrastructure (2 weeks)

**Deliverables**:
- [ ] BullMQ + Redis setup
- [ ] Database tables: `forge_task_queues`, `forge_task_jobs`
- [ ] Queue CRUD operations
- [ ] Job CRUD operations with retry logic
- [ ] Basic worker pool

**Success Criteria**:
- Jobs enqueue and process
- Retries work correctly
- No data loss on restart

### Phase 2: Event Processing (1 week)

**Deliverables**:
- [ ] Database tables: `forge_task_events`, `forge_task_event_subscriptions`
- [ ] Event routing with pattern matching
- [ ] Subscription management

**Success Criteria**:
- Events route to correct subscriptions
- Jobs created from events

---

## 8. Key Requirements

- Create and manage queues
- Enqueue jobs with priority and retry logic
- Retrieve job status and results
- Subscribe to events and trigger job creation
- Support basic pattern matching on events (e.g., "payment.*")

### 8.3 Job Execution Guarantees

- Jobs retry on failure with exponential backoff
- Max retry attempts configurable per queue (default: 3)
- Failed jobs after retries stored for manual review

---

## 9. Use Cases

**Use Case 1: Long-Running Email Campaign**
Agent enqueues email jobs (10,000+) instead of sending synchronously. Jobs process in parallel, retry on failure.

**Use Case 2: Event-Triggered Data Export**
When webhook event fires (user signup), automatically enqueue export job.

**Use Case 3: Scheduled Maintenance**
Cron job enqueues cleanup task instead of running synchronously.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Redis unavailability | Ensure Redis is running; backups |
| Job handler errors | Proper error handling and logging |
| Duplicate job execution | Job handlers should be idempotent |

---

## 11. Success Criteria

- [ ] Agent can create queue and enqueue jobs
- [ ] Jobs execute and are retrievable
- [ ] Failed jobs retry correctly
- [ ] Event subscriptions trigger job creation
- [ ] Pattern matching works (e.g., "payment.*")

---

## 12. Dependencies

- **BullMQ**: Job queue library
- **Redis**: In-memory data store for job coordination
- **LibSQL**: For audit trail and job history

---

## 13. Future Enhancements

- Job progress tracking
- Time-based scheduling
- Batch job processing
- Rate limiting per queue
- Multi-step workflow orchestration (future phase)

---

## 14. Timeline

- **Phase 1 (Queue Infrastructure)**: 2 weeks
- **Phase 2 (Event Processing)**: 1 week
- **Total MVP**: 3 weeks
