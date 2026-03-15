# PRD — Task Queue & Event Processing

**Feature**: Task Queue & Event Processing
**Version**: 1.0
**Status**: In Analysis & Planning
**Last Updated**: 2026-03-15
**Scope**: Personal developer project - KISS & YAGNI principles apply

---

## 1. Executive Summary

Enable agents to queue long-running tasks asynchronously using BullMQ for job persistence and Redis for coordination.

**Core Objective**: Allow agents to defer work without blocking, with automatic retries on failure.

---

## 2. Vision & Strategic Context

Build a simple asynchronous task execution system where agents can defer work to job queues without blocking operations.

---

## 3. Problem Statement

### 3.1 Current State
- **Agent execution model**: Primarily synchronous with limited ability to defer work
- **No job queuing**: Long-running tasks block agents; no retry or failure recovery mechanisms

### 3.2 User Needs
- **Defer long-running work**: Fire-and-forget task execution without blocking agent loops
- **Reliable retry logic**: Automatic retry on transient failures with exponential backoff

---

## 4. Objectives & Success Metrics

### 4.1 Primary Objectives
1. **Integrate BullMQ** as job queue for reliable task persistence
2. **Provide agent-facing API** for task enqueueing and status retrieval
3. **Support automatic retries** with exponential backoff

### 4.2 Success Metrics
| Metric | Target |
|---|---|
| Task enqueue latency | <100ms |
| Job retry logic works | 3 max attempts |

---

## 5. Functional Requirements

### 5.1 Task Queue Entity Model

#### 5.1.1 Queue Definition Schema
```
Queue {
  queueId: UUID                    // Internal unique identifier
  name: string                     // Queue name (e.g., "email-delivery", "data-export")
  concurrency: number              // Max concurrent workers (default: 5)
  maxRetries: number               // Max retry attempts (default: 3)
  createdAt: ISO8601              // Creation timestamp
}
```

#### 5.1.2 Job Schema
```
Job {
  jobId: UUID                      // Globally unique job identifier
  queueId: UUID                    // Which queue this job belongs to
  type: string                     // Job type (e.g., "send-email", "process-csv")
  payload: Record<string,any>      // Job parameters
  status: "pending" | "processing" | "completed" | "failed"
  attempts: number                 // Current attempt count
  result?: Record<string,any>      // Job output (on completion)
  error?: string                   // Error message (on failure)
  createdAt: ISO8601              // When job was created
  completedAt?: ISO8601           // When job finished/failed
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

**enqueueJob(input)** — Add job to queue
```typescript
enqueueJob(input: {
  queueId: string;
  type: string;
  payload: Record<string,any>;
}): Promise<{ jobId: string; }>
```

**getJob(jobId)** — Get job status and result

**listJobs(queueId)** — List jobs in queue

**retryJob(jobId)** — Manually retry failed job

### 5.3 Data Persistence

#### 5.3.1 New Tables (Task Queue Store)

**forge_task_queues**
```
CREATE TABLE forge_task_queues (
  queue_id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  concurrency INTEGER DEFAULT 5,
  max_retries INTEGER DEFAULT 3,
  created_at TEXT NOT NULL
);
```

**forge_task_jobs**
```
CREATE TABLE forge_task_jobs (
  job_id TEXT PRIMARY KEY,
  queue_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  payload TEXT NOT NULL,         -- JSON
  result TEXT,                   -- JSON (on completion)
  error TEXT,
  attempts INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (queue_id) REFERENCES forge_task_queues(queue_id),
  INDEX idx_queue_status (queue_id, status),
  INDEX idx_created_at (created_at)
);
```

#### 5.3.2 BullMQ Integration

- **Storage**: BullMQ stores job data in Redis
- **LibSQL**: Stores job history and results for long-term retrieval

---

## 6. Technical Architecture

### 6.1 System Components

```
Task Queue System
├─ Queue Manager (BullMQ)
│  ├─ Queue creation
│  ├─ Job persistence in Redis
│  └─ Worker pool management
└─ Agent-Facing API
   ├─ Task enqueueing tools
   └─ Job status/retrieval tools
```

### 6.2 Message Flow — Job Enqueueing

```
Agent.enqueueJob({ queueId, type, payload })
  ↓
TaskQueueManager.enqueueJob()
  ├─ Validate queue exists
  ├─ Create Job entity in LibSQL
  ├─ Push to BullMQ (Redis)
  └─ Return jobId + status
```

### 6.3 Message Flow — Job Execution

```
BullMQ Worker processes job
  ↓
1. Fetch job payload
2. Execute job handler
3. Update job status in BullMQ + LibSQL
4. On success: Store result in LibSQL
5. On failure:
   ├─ Store error in LibSQL
   ├─ Evaluate retry policy
   └─ Reschedule with backoff if retries available
```

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

---

## 8. Key Requirements

- Create and manage queues
- Enqueue jobs with retry logic
- Retrieve job status and results
- Jobs retry on failure with exponential backoff
- Max retry attempts configurable per queue (default: 3)

---

## 9. Use Cases

**Use Case 1: Long-Running Email Campaign**
Agent enqueues email jobs instead of sending synchronously. Jobs process in parallel, retry on failure.

**Use Case 2: Data Processing**
Agent enqueues data processing tasks (CSV export, report generation) instead of blocking.

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

---

## 14. Timeline

- **Phase 1 (Queue Infrastructure)**: 2 weeks
- **Total MVP**: 2 weeks
