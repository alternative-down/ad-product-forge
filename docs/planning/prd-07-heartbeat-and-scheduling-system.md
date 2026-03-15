# PRD-07: Heartbeat and Scheduling System

> **Note:** This is a personal project for a solo developer using LLM agents. Simplified for ease and practicality (KISS + YAGNI). Enterprise scheduling, distributed systems, and complex orchestration are out of scope.

**Status:** Draft
**Version:** 1.0
**Created:** 2026-03-15
**Last Updated:** 2026-03-15

---

## Executive Summary

The **Heartbeat and Scheduling System** enables agents to remain active and autonomous by implementing periodic health checks and autonomous scheduling capabilities.

**Core Objective:** Allow agents to schedule their own tasks and remain responsive even without external events.

---

## 1. Problem Statement

### Current State

Agents operate on an event-driven model:
- Agents wake only when external messages arrive
- No mechanism for agents to schedule recurring tasks
- Agents cannot check for pending work or resume interrupted operations

### Pain Points

1. **No Autonomous Tasks**: Agents cannot schedule recurring work
2. **No Work Resumption**: Interrupted executions cannot be resumed
3. **No Visibility**: No heartbeat indicates agent health

---

## 2. Product Goals & Success Metrics

### Primary Goals

| Goal | Description | Success Metric |
| --- | --- | --- |
| **Agent Autonomy** | Enable agents to schedule and execute their own tasks | Agents execute scheduled tasks without external triggers |
| **Work Continuity** | Resume interrupted executions automatically | 100% of pending tasks resume within heartbeat interval |
| **System Health** | Maintain visibility into agent liveness | All agents report heartbeat status; zero stale agents |
| **Efficient Wake-up** | Minimize CPU overhead from periodic checks | Heartbeat interval ≥ 5 minutes; debounce < 1 second |
| **Autonomous Scheduling** | Enable agents to create and manage cron jobs | Agents create cron jobs via internal messaging |

### Success Metrics

- **Heartbeat Delivery**: 100% of heartbeat events reach agents within configured interval
- **Scheduling Success Rate**: > 99% of cron jobs execute at scheduled times (±30 seconds)
- **Agent Wake Latency**: < 500ms from heartbeat trigger to agent execution start
- **Resource Efficiency**: Heartbeat processing uses < 2% CPU per agent (measured on 100-agent system)
- **Job Resumption Rate**: > 95% of interrupted jobs resume successfully

### OKRs

**Q2 2026 OKRs:**
- **O1**: All agents remain responsive and schedulable
  - KR1: Implement heartbeat system for 100% of agents
  - KR2: Enable ≥ 3 agents to schedule autonomous tasks

- **O2**: Support agent-driven work resumption
  - KR1: 95%+ interrupted task resumption success
  - KR2: Zero manual job restarts for agent failures

---

## 3. User Stories & Use Cases

### User Story 1: Daily Report Generation
**As an** autonomous reporting agent
**I want to** execute a daily summary task without external triggers
**So that** stakeholders receive consistent reports every morning at 8 AM

**Acceptance Criteria:**
- Agent creates a cron job: `0 8 * * *` (daily at 8 AM)
- Agent wakes at scheduled time
- Execution generates report and sends via communication provider
- Failed executions are logged and can be retried

**Implementation Notes:**
- Agent uses internal messaging to register cron job
- Heartbeat system schedules execution
- Agent's scheduled execution uses same run-loop as event-driven execution

---

### User Story 2: Periodic Health Checks
**As an** autonomous monitoring agent
**I want to** check system health every 30 minutes
**So that** issues are detected and logged early

**Acceptance Criteria:**
- Agent schedules: `*/30 * * * *` (every 30 minutes)
- Heartbeat system triggers execution reliably
- Agent queries connected systems and logs results
- Health status is updated in agent's memory

**Implementation Notes:**
- Cron job is stored durably (survives agent restart)
- Execution includes context about last check
- Memory system tracks health history

---

### User Story 3: Interrupted Execution Resumption
**As an** autonomous development agent
**I want to** resume a multi-day build task that was interrupted
**So that** long-running operations complete despite temporary pauses

**Acceptance Criteria:**
- Agent detects pending/incomplete tasks on heartbeat
- Execution resumes from last checkpoint
- Progress is preserved in agent's memory
- Final summary updates thread with completion status

**Implementation Notes:**
- Pending tasks stored in agent's memory
- Each task stores execution state (started, in-progress, paused, completed)
- Resume execution includes prior context and progress

---

### User Story 4: Agent Health Visibility
**As a** system operator
**I want to** verify that all agents are responsive and healthy
**So that** I can detect issues before they impact operations

**Acceptance Criteria:**
- Each agent maintains last-heartbeat timestamp
- API endpoint shows all agents' heartbeat status
- Stale agents (no heartbeat > 2x interval) are flagged
- System alerts on unexpected agent silence

**Implementation Notes:**
- Heartbeat status stored in agent's metadata
- Status dashboard queries agent runtime for liveness
- Optional email/Slack alerts on stale agents

---

### Use Case: Agent-Initiated Cron Jobs

**Scenario**: Content distribution agent wants to check social platforms for new posts every 4 hours.

**Flow**:
1. Agent sends internal message: `POST /scheduling/jobs` with cron expression `0 */4 * * *`
2. Runtime validates cron syntax
3. Job is stored in agent's scheduling table
4. At each heartbeat check, runtime evaluates pending cron jobs
5. If cron matches current time, agent is woken with execution context
6. Agent executes defined task (e.g., "Check and distribute new content")
7. Execution completes and updates job's last-run timestamp

**Key Design Point**: Agents create cron jobs via internal messaging (not direct API calls), maintaining isolation and auditability.

---

## 4. Feature Requirements & Specifications

### 4.1 Functional Requirements

#### FR-1: Heartbeat Infrastructure
- **FR-1.1**: Runtime implements periodic heartbeat loop for each agent
- **FR-1.2**: Heartbeat interval configurable per agent (default: 5 minutes)
- **FR-1.3**: Heartbeat can be triggered manually for testing/debugging
- **FR-1.4**: Heartbeat includes minimal metadata (timestamp, agent-id, status)
- **FR-1.5**: Heartbeat events are debounced to prevent duplicate wake-ups (debounce window: 1000ms)

#### FR-2: Autonomous Cron Job Scheduling
- **FR-2.1**: Agents can create cron jobs via internal messaging (`internalMessage.sendScheduleJob()`)
- **FR-2.2**: Cron syntax follows standard Unix cron format: `minute hour day month day-of-week`
- **FR-2.3**: Each cron job has: job-id, cron-expression, agent-id, description, enabled status
- **FR-2.4**: Agents can list, update, delete their own cron jobs
- **FR-2.5**: Cron jobs persist across agent restarts (stored in scheduling table)
- **FR-2.6**: Maximum 50 cron jobs per agent (to prevent resource exhaustion)

#### FR-3: Heartbeat-Triggered Execution
- **FR-3.1**: Runtime evaluates all cron jobs at each heartbeat
- **FR-3.2**: Matching cron jobs trigger agent execution with `type: "scheduled"`
- **FR-3.3**: Scheduled execution uses same run-loop as event-driven execution
- **FR-3.4**: Execution context includes job metadata and execution history
- **FR-3.5**: Execution skips cron job if previous execution is still running (prevents overlap)

#### FR-4: Pending Task Detection
- **FR-4.1**: Agents can query pending tasks via `getPendingTasks()` tool
- **FR-4.2**: Pending tasks include: incomplete executions, failed jobs, paused workflows
- **FR-4.3**: Agent can resume pending task by calling `resumeTask(taskId)`
- **FR-4.4**: Resume execution preserves prior context and progress from memory
- **FR-4.5**: Resume execution is tracked separately from original execution in logging

#### FR-5: Agent Health Monitoring
- **FR-5.1**: Each agent maintains `lastHeartbeatAt` timestamp
- **FR-5.2**: Runtime updates timestamp on every successful heartbeat
- **FR-5.3**: Agent status includes: active, idle, stale (no heartbeat > 2x interval)
- **FR-5.4**: API exposes agent status via `GET /agents/{agentId}/status`
- **FR-5.5**: Stale agents are flagged in system dashboard

#### FR-6: Scheduling Configuration
- **FR-6.1**: System config enables/disables heartbeat per agent or globally
- **FR-6.2**: Heartbeat interval configurable: `agentConfig.heartbeat.interval` (ms)
- **FR-6.3**: Debounce window configurable: `agentConfig.heartbeat.debounceMs` (default: 1000)
- **FR-6.4**: Max execution duration for scheduled tasks configurable (default: 1 hour)
- **FR-6.5**: Timezone support for cron jobs (UTC default, configurable per agent)

---

### 4.2 Non-Functional Requirements

| Requirement | Specification |
| --- | --- |
| **Performance** | Heartbeat evaluation < 100ms per agent; cron matching < 10ms |
| **Scalability** | Support ≥ 100 concurrent agents with heartbeat intervals ≥ 5 min |
| **Reliability** | 99.9% heartbeat delivery; no lost cron jobs due to crashes |
| **Durability** | Cron jobs and pending tasks persisted in agent's LibSQL database |
| **Observability** | Log all heartbeat events, cron executions, and resumptions |
| **Security** | Agents can only manage their own cron jobs; internal messaging validated |
| **Isolation** | Scheduled executions isolated per agent; no cross-agent interference |

---

## 5. Technical Architecture & Design

### 5.1 Core Components

```
Agent Runtime
├─ Heartbeat Manager
│  ├─ Heartbeat Loop (interval-based)
│  ├─ Debouncer (prevents duplicate wake-ups)
│  └─ Cron Evaluator (matches pending jobs)
│
├─ Scheduling Store (LibSQL)
│  ├─ CronJobs table (job-id, agent-id, expression, enabled, lastRun, nextRun)
│  ├─ PendingTasks table (task-id, agent-id, status, context, createdAt)
│  └─ ExecutionHistory table (execution-id, job-id, status, startedAt, completedAt)
│
└─ Agent API
   ├─ sendScheduleJob(expression, description) → job-id
   ├─ listJobs() → CronJob[]
   ├─ deleteJob(job-id) → success
   ├─ getPendingTasks() → PendingTask[]
   └─ resumeTask(task-id) → execution-id
```

### 5.2 Heartbeat Loop Implementation

```typescript
// Pseudo-code
async function startHeartbeatLoop(agent) {
  const interval = agent.config.heartbeat.interval || 300000; // 5 min default
  const debouncer = createDebouncer(1000); // 1s debounce

  setInterval(async () => {
    // Evaluate all cron jobs for this agent
    const pendingJobs = await evaluateCronJobs(agent.id);

    // Update lastHeartbeatAt
    await updateAgentStatus(agent.id, { lastHeartbeatAt: now() });

    // Wake agent if there's work to do
    if (pendingJobs.length > 0 || hasInterruptedTasks(agent.id)) {
      debouncer.notify(() => {
        agent.wakeQueue.notifyScheduledEvent(pendingJobs);
      });
    }

    // Log heartbeat for monitoring
    logger.debug(`Heartbeat: agent=${agent.id}, jobs=${pendingJobs.length}`);
  }, interval);
}
```

### 5.3 Cron Evaluation

```typescript
// Cron matching logic
function evaluateCronJobs(agentId, currentTime = new Date()): CronJob[] {
  const jobs = db.query(
    `SELECT * FROM cron_jobs WHERE agent_id = ? AND enabled = true`,
    [agentId]
  );

  return jobs.filter(job => {
    const nextRun = calculateNextRun(job.expression, job.lastRun);
    return nextRun <= currentTime; // Job is due
  });
}

function calculateNextRun(cronExpression, lastRun): Date {
  // Use cron parser library (e.g., cron-parser)
  const interval = cronParser.parseExpression(cronExpression);
  return interval.next().toDate();
}
```

### 5.4 Database Schema

**forge_scheduling_cron_jobs**
```sql
CREATE TABLE forge_scheduling_cron_jobs (
  job_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT true,
  timezone TEXT DEFAULT 'UTC',
  last_run_at TIMESTAMP,
  next_run_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSON,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);
```

**forge_scheduling_pending_tasks**
```sql
CREATE TABLE forge_scheduling_pending_tasks (
  task_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  status TEXT, -- pending, running, completed, failed, paused
  context JSON, -- saved execution state
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);
```

**forge_scheduling_execution_history**
```sql
CREATE TABLE forge_scheduling_execution_history (
  execution_id TEXT PRIMARY KEY,
  job_id TEXT,
  task_id TEXT,
  agent_id TEXT NOT NULL,
  status TEXT, -- success, failed, timeout
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  error_message TEXT,
  result JSON,
  FOREIGN KEY (job_id) REFERENCES forge_scheduling_cron_jobs(job_id),
  FOREIGN KEY (task_id) REFERENCES forge_scheduling_pending_tasks(task_id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);
```

### 5.5 Integration Points

#### With Communication Module
- Scheduled executions can use communication tools (sendMessage, etc.)
- No special handling needed; scheduled execution is transparent to providers

#### With Memory System
- Pending task context stored in agent memory
- Execution includes memory-injected context (via existing processors)
- Resumption reads task context from memory before execution

#### With Wake Queue
- Heartbeat events feed into existing wake queue
- Debouncing leverages same mechanism as communication (1s debounce, 10s max)
- Agent execution flow unchanged; only trigger source differs

#### With Agent Storage (LibSQL)
- Scheduling tables created per-agent database
- Schema migrations run on first agent creation
- All scheduling data persists alongside communication and memory data

---

## 6. User Experience (UX) & Workflows

### 6.1 Agent-Initiated Cron Job Creation

**Agent Instruction**:
```
You are a content distribution agent. Every 4 hours, check available content
and distribute to social platforms. Use the internal messaging system to
register a cron job: POST /scheduling/jobs with expression "0 */4 * * *".
```

**Agent Execution Flow**:
```
1. Agent recognizes need for periodic task
2. Sends internal message:
   {
     "type": "schedule_job",
     "expression": "0 */4 * * *",
     "description": "Check and distribute content"
   }
3. Runtime creates cron job in database
4. Every 4 hours, heartbeat triggers execution
5. Agent wakes with prompt: "Scheduled task: Check and distribute content"
6. Agent executes task logic
7. Execution result logged; next_run_at updated
```

### 6.2 Interrupted Task Resumption

**Agent Instruction**:
```
At the start of your execution, check for any pending tasks and resume them.
Use getPendingTasks() to discover interrupted work.
```

**Agent Execution Flow**:
```
1. Heartbeat wakes agent
2. Agent calls getPendingTasks()
3. If pending tasks exist:
   - Agent calls resumeTask(taskId)
   - Runtime injects prior context into execution
   - Agent resumes from checkpoint
4. Execution continues as normal
5. On completion, pending task status updated to "completed"
```

### 6.3 Health Monitoring Operator View

**Operator Dashboard**:
```
Agents Status Overview
┌─────────────────────────────────────────────────────┐
│ Agent ID         │ Status  │ Last Heartbeat  │ Jobs │
├─────────────────────────────────────────────────────┤
│ reporting-agent  │ Active  │ 2 min ago       │ 3    │
│ monitoring-agent │ Idle    │ 12 min ago      │ 5    │
│ dev-agent        │ STALE   │ 45 min ago      │ 2    │ ⚠️
└─────────────────────────────────────────────────────┘

Alerts:
🔴 dev-agent is stale (expected heartbeat every 15 min)
```

---

## 7. Competitor & Industry Analysis

### Relevant Systems

| System | Approach | Lessons |
| --- | --- | --- |
| **Apache Airflow** | DAG-based scheduling, centralized orchestrator | Complex but battle-tested; we simplify with agent-owned cron |
| **Temporal** | Workflow engine with durable execution | Durability + resumption model informs our design |
| **AWS Lambda + EventBridge** | Serverless scheduled events | Debouncing and lazy evaluation inspired by EventBridge |
| **n8n** | Visual workflow automation with cron triggers | Cron UI important for humans; ours agent-driven instead |
| **Discord/Slack Bots** | Always-on with message-based scheduling | Event-driven baseline; we extend with heartbeat |

### Differentiators

1. **Agent Autonomy**: Agents schedule themselves; no centralized scheduler
2. **Durability**: Cron jobs survive agent crashes (stored in LibSQL)
3. **Low Overhead**: Minimal heartbeat interval (5min default) suitable for lean deployment
4. **Integration**: Seamless with existing communication, memory, and execution model
5. **Transparency**: All scheduling audited and logged to agent memory

---

## 8. Risk Analysis & Mitigation

### Risk 1: Heartbeat Storms (Thundering Herd)
**Risk**: If many agents wake simultaneously, CPU/network spike
**Mitigation**:
- Heartbeat intervals randomized within ±10% of configured value
- Debounce window (1s) prevents rapid re-triggering
- Stagger heartbeat start times per agent

---

### Risk 2: Cron Job Overlap (Double Execution)
**Risk**: If execution takes longer than heartbeat interval, next run starts before prior completes
**Mitigation**:
- Check if job is already running before triggering new execution
- Store `isRunning` flag in cron_jobs table
- Log overlap attempts for monitoring

---

### Risk 3: Lost Cron Jobs (Database Corruption)
**Risk**: Cron jobs lost due to storage failure
**Mitigation**:
- Store cron jobs in agent's LibSQL database (same as communication/memory)
- Regular backups of agent databases
- Migration script to recover jobs from logs/audits

---

### Risk 4: Runaway Scheduled Executions
**Risk**: Agent enters infinite loop in scheduled task, blocking subsequent executions
**Mitigation**:
- Maximum execution time per scheduled task (default: 1 hour, configurable)
- Task timeout triggers abort and logging
- Agent wakes on timeout to allow recovery

---

### Risk 5: Timezone Misconfiguration
**Risk**: Cron jobs execute at wrong time due to timezone issues
**Mitigation**:
- Default to UTC; warn if timezone differs from system
- Timezone stored per cron job; validated on creation
- Daylight saving time handled by standard cron library

---

### Risk 6: Memory Exhaustion (Too Many Pending Tasks)
**Risk**: Agent accumulates too many pending tasks, memory grows unbounded
**Mitigation**:
- Limit pending tasks table to 1000 entries per agent
- Completed tasks auto-purged after 30 days
- Alert if pending tasks exceed 80% of limit

---

## 9. Implementation Plan & Roadmap

### Phase 1: Core Heartbeat (Week 1-2)
**Goal**: Heartbeat loop infrastructure in place

- [ ] Implement `HeartbeatManager` class in `packages/mastra-engine/src/agent/heartbeat/`
- [ ] Create scheduling database schema migration
- [ ] Add heartbeat configuration to agent config interface
- [ ] Implement heartbeat loop in `createAgent()` wiring
- [ ] Add logging and metrics for heartbeat events
- [ ] Write unit tests for heartbeat loop

**Deliverables**:
- Heartbeat events logged; agents show lastHeartbeatAt
- No functional executions yet; just infrastructure

---

### Phase 2: Cron Job Management (Week 3-4)
**Goal**: Agents can create and manage cron jobs

- [ ] Implement cron job CRUD tools in agent API
- [ ] Integrate cron-parser library for expression validation
- [ ] Add `sendScheduleJob()` internal messaging tool
- [ ] Implement cron evaluation logic (`evaluateCronJobs()`)
- [ ] Wire cron jobs to wake queue
- [ ] Write integration tests

**Deliverables**:
- Agents can create cron jobs via internal messages
- Cron jobs persisted and listed via API
- Cron evaluation at heartbeat

---

### Phase 3: Scheduled Execution (Week 5-6)
**Goal**: Heartbeat-triggered execution flows work end-to-end

- [ ] Extend wake queue to handle scheduled events
- [ ] Implement execution context for scheduled runs
- [ ] Add execution history logging
- [ ] Implement overlap prevention (isRunning flag)
- [ ] Test with 2-3 sample agents
- [ ] Performance testing (100 agents, concurrent heartbeats)

**Deliverables**:
- Cron jobs trigger agent execution reliably
- Execution history tracked
- Zero duplicate executions

---

### Phase 4: Pending Task Resumption (Week 7-8)
**Goal**: Agents can detect and resume interrupted work

- [ ] Implement `getPendingTasks()` tool
- [ ] Implement `resumeTask()` tool
- [ ] Create PendingTasks table and management logic
- [ ] Integrate with memory system for context injection
- [ ] Write scenario tests (multi-day task resumption)

**Deliverables**:
- Agents detect pending tasks at heartbeat
- Resume execution preserves prior context
- 95%+ successful resumptions

---

### Phase 5: Health Monitoring & Dashboard (Week 9-10)
**Goal**: System visibility into agent health and scheduling

- [ ] Implement agent status API (`GET /agents/{id}/status`)
- [ ] Add dashboard widget for agent heartbeat status
- [ ] Implement alerts for stale agents
- [ ] Add scheduling metrics (jobs created, success rate, avg duration)
- [ ] Documentation and runbook for operators

**Deliverables**:
- Dashboard shows all agent heartbeats
- Stale agents flagged and alerted
- Metrics available via API

---

### Phase 6: Optimization & Hardening (Week 11-12)
**Goal**: Production-ready reliability and performance

- [ ] Load testing: 100+ agents, concurrent heartbeats
- [ ] Failure scenario testing (crashes, network outages)
- [ ] Migration testing (existing agent databases)
- [ ] Performance tuning (cron evaluation, debounce)
- [ ] Security audit (access control, injection prevention)
- [ ] Documentation: agent instructions, operator runbook

**Deliverables**:
- Meets all performance targets
- 99.9% heartbeat delivery
- Production deployment guide

---

### Timeline

```
Week 1-2   [====] Heartbeat Infrastructure
Week 3-4   [====] Cron Job Management
Week 5-6   [====] Scheduled Execution
Week 7-8   [====] Task Resumption
Week 9-10  [====] Health Monitoring
Week 11-12 [====] Production Hardening
           [======================] Total: ~3 months
```

---

## 10. Dependencies & Integration Points

### Internal Dependencies

| Dependency | Status | Impact | Mitigation |
| --- | --- | --- | --- |
| LibSQL Storage | ✅ Implemented | Scheduling data persisted | No action needed |
| Wake Queue | ✅ Implemented | Events trigger executions | Extend for scheduled events |
| Memory System | ✅ Implemented | Context injection for resumptions | Integrate via existing processors |
| Communication Module | ✅ Implemented | Scheduled tasks can send messages | No changes needed |
| Agent Config | ✅ Implemented | Heartbeat interval configurable | Extend config schema |

### External Dependencies

| Dependency | Version | Purpose | License |
| --- | --- | --- | --- |
| `cron-parser` | ^4.0+ | Parse and evaluate cron expressions | MIT |
| (Optional) `node-cron` | ^3.0+ | Alternative cron evaluation | ISC |

### System Assumptions

- Agents have unique, stable IDs (per existing design)
- Agent storage (LibSQL) is writable and persistent
- Heartbeat loop can be long-running (no function-as-a-service constraints)
- System clock is reasonably synchronized across runtime(s)

---

## 11. Success Criteria & Acceptance Tests

### Acceptance Tests

#### Test 1: Heartbeat Delivery
```gherkin
Feature: Agent Heartbeat
  Scenario: Agent receives heartbeat at configured interval
    Given an agent with heartbeat interval = 5 minutes
    When time advances by 5 minutes
    Then lastHeartbeatAt is updated within 100ms
    And heartbeat event is logged
```

#### Test 2: Cron Job Creation
```gherkin
Feature: Cron Job Management
  Scenario: Agent creates a cron job
    Given an agent with ID "test-agent"
    When agent sends: { type: "schedule_job", expression: "0 8 * * *" }
    Then job is stored in cron_jobs table
    And job.enabled = true
    And job.next_run_at is calculated
```

#### Test 3: Scheduled Execution
```gherkin
Feature: Scheduled Execution
  Scenario: Cron job triggers execution at scheduled time
    Given a cron job "0 8 * * *" for agent "test-agent"
    When current time = 08:00:00
    And heartbeat evaluates cron jobs
    Then agent.generate() is called with type: "scheduled"
    And execution history is logged
    And job.last_run_at is updated
```

#### Test 4: Pending Task Resumption
```gherkin
Feature: Task Resumption
  Scenario: Agent resumes interrupted task
    Given pending task with ID "task-123" in status "paused"
    When agent calls resumeTask("task-123")
    Then execution starts with prior context injected
    And task memory includes execution history
    And execution completes successfully
```

#### Test 5: Overlap Prevention
```gherkin
Feature: Execution Overlap Prevention
  Scenario: Running job prevents duplicate execution
    Given cron job "*/5 * * * *" (every 5 min)
    And job is currently running (isRunning = true)
    When heartbeat time matches cron expression
    Then execution is NOT triggered
    And overlap is logged
```

---

## 12. Rollout & Deployment Strategy

### Pre-Deployment

- [ ] Feature flag: `features.heartbeatScheduling.enabled` (default: false)
- [ ] Database migration script validates and creates scheduling tables
- [ ] Backward compatibility: agents without heartbeat config use defaults
- [ ] Documentation: agent instructions, operator guide, troubleshooting

### Phased Rollout

**Phase 1: Internal Testing (Week 10)**
- Enable for internal test agents only
- Validate heartbeat delivery, cron execution, resumption
- Performance testing with 5-10 concurrent agents

**Phase 2: Beta Rollout (Week 11)**
- Enable for 20% of agents (feature flag)
- Monitor heartbeat metrics, error rates, latency
- Collect feedback from pilot users

**Phase 3: General Availability (Week 12)**
- Enable for 100% of agents
- Monitor for 1 week; rollback if critical issues
- Publish runbook and metrics dashboard

### Monitoring & Alerting

**Key Metrics**:
- Heartbeat delivery rate (target: 99.9%)
- Cron execution success rate (target: 99%)
- Average execution latency (target: < 500ms)
- Pending task resumption success (target: > 95%)
- Agent stale rate (target: < 1%)

**Alerts**:
- Heartbeat delivery drops below 95%
- Cron execution success drops below 95%
- Agent stale for > 2x configured interval
- Pending task queue grows > 100 items

---

## 13. Future Enhancements & Post-Launch

### Short-Term (Post-Launch)

1. **Cron Job Dashboard**: Visual editor for creating/editing cron jobs (UI component)
2. **Execution Metrics**: Per-agent dashboard of scheduled task performance
3. **Retry Logic**: Configurable retry policy for failed cron executions
4. **Timezone UI**: Web interface to configure agent timezone and DST rules

### Medium-Term (Q3 2026)

1. **Cron Templates**: Pre-built cron patterns (daily, weekly, monthly, custom)
2. **Job Dependencies**: Cron jobs can depend on other jobs' completion
3. **Dry-Run Mode**: Test cron expressions before enabling
4. **Notification System**: Alerts on job failures, long-running tasks

### Long-Term (Q4 2026+)

1. **Distributed Scheduling**: Heartbeat system works across multiple runtime instances
2. **Advanced Triggers**: Event-based triggers beyond cron (webhook, message arrival, etc.)
3. **Job Persistence**: Store job outputs in workspace for historical analysis
4. **Agent Coordination**: Multi-agent scheduled workflows (agents triggering each other)

---

## Appendix A: Glossary

| Term | Definition |
| --- | --- |
| **Heartbeat** | Periodic signal indicating an agent is alive and ready |
| **Cron Job** | Autonomous scheduled task defined by cron expression (Unix cron format) |
| **Scheduled Execution** | Agent execution triggered by cron job, not external event |
| **Pending Task** | Incomplete execution stored for resumption at later time |
| **Task Resumption** | Continuing a pending task from its last checkpoint |
| **Debounce** | Mechanism to prevent duplicate wake-ups within short time window |
| **Stale Agent** | Agent that hasn't reported heartbeat within 2x configured interval |

---

## Appendix B: Cron Expression Examples

```
0 0 * * *        # Daily at midnight
0 8 * * *        # Daily at 8 AM
0 */4 * * *      # Every 4 hours
*/30 * * * *     # Every 30 minutes
0 0 * * 1        # Weekly on Monday at midnight
0 0 1 * *        # Monthly on 1st at midnight
0 0 1 1 *        # Yearly on January 1st
*/5 9-17 * * 1-5 # Every 5 min, 9 AM–5 PM, weekdays only
```

---

## Appendix C: Configuration Example

```typescript
// Agent creation with heartbeat
const agent = await createForgeAgent({
  id: "daily-reporter",
  name: "Daily Report Agent",
  instructions: "Generate daily reports at 8 AM...",
  model: "claude-3-5-sonnet",

  // Heartbeat configuration
  heartbeat: {
    enabled: true,
    interval: 300000,        // 5 minutes
    debounceMs: 1000,        // 1 second
    maxExecutionMs: 3600000, // 1 hour max per scheduled task
    timezone: "America/New_York",
  },

  // Other config...
});
```

---

## Appendix D: API Reference (Summary)

### Agent-Facing Tools

```typescript
// Send scheduled job to create cron job
sendScheduleJob(expression: string, description?: string): Promise<{ jobId: string }>

// List cron jobs for this agent
listScheduledJobs(): Promise<CronJob[]>

// Delete a cron job
deleteScheduledJob(jobId: string): Promise<{ success: boolean }>

// Get pending tasks awaiting resumption
getPendingTasks(filter?: { status?: string }): Promise<PendingTask[]>

// Resume a pending task
resumeTask(taskId: string): Promise<{ executionId: string }>

// Get execution history for a cron job
getJobExecutionHistory(jobId: string, limit?: number): Promise<Execution[]>
```

### Runtime API

```typescript
// Check agent health (operator use)
GET /agents/{agentId}/status
Response: {
  agentId, lastHeartbeatAt, status, cronJobsCount,
  pendingTasksCount, nextScheduledRun
}

// List all agent statuses
GET /agents/status
Response: AgentStatus[]
```

---

## Document History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 1.0 | 2026-03-15 | Engineering | Initial PRD with full 13-section structure |

---

**Document Status:** Ready for Review
**Next Steps:** Engineering review, technical feasibility assessment, begin Phase 1 implementation
