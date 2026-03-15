# PRD-13: GitHub Integration

**Status:** Planning
**Feature:** GitHub Integration
**Last Updated:** 2026-03-15

---

## 1. Executive Summary

The GitHub Integration feature enables agents to manage GitHub repositories and respond to repository events. Agents gain the ability to access organization GitHub accounts, create and manipulate repositories, implement event-driven workflows through GitHub webhooks, and orchestrate agent actions based on repository events. This feature establishes agents as active participants in software development workflows, enabling automation of repository management, CI/CD orchestration, issue handling, pull request review processes, and code-based decision making.

**Business Value:**
- Enable agents to directly manage and maintain GitHub repositories
- Automate repository creation, configuration, and maintenance workflows
- Trigger agent actions in response to real-time GitHub events (pushes, PRs, issues)
- Reduce manual repository management overhead
- Enable agents to contribute to development workflows autonomously
- Support event-driven automation patterns for software development
- Integrate agents into existing GitHub-based development processes

---

## 2. Problem Statement

Current agents operate independently from GitHub and software development workflows. There is no mechanism to:

1. Grant agents authenticated access to GitHub repositories and organizations
2. Enable agents to programmatically create and configure repositories
3. Respond to GitHub events in real-time (push events, pull request events, issue events, etc.)
4. Establish bidirectional communication between agents and GitHub-based workflows
5. Orchestrate agent actions as part of development pipeline events
6. Enable agents to manage repository settings, collaborators, and permissions
7. Support automated code review, issue triage, and release coordination

This limitation prevents agents from participating in development workflows and reduces their ability to autonomously manage code-related tasks.

---

## 3. Goals & Success Criteria

### Primary Goals

1. **GitHub Organization Access**
   - Agents can authenticate with GitHub organizational accounts
   - Agents can list and query repositories within organization
   - Agents can read organization metadata and settings
   - Access is scoped and controllable (read-only vs. write permissions)

2. **Repository Management**
   - Agents can programmatically create new repositories
   - Agents can update repository settings and metadata
   - Agents can manage repository collaborators and permissions
   - Agents can delete or archive repositories
   - Repository operations are idempotent and safe

3. **Event-Driven Workflows**
   - GitHub webhooks route repository events to agents
   - Agents receive real-time notifications of repository activity
   - Event types supported: push, pull_request, issues, releases, discussions
   - Events trigger agent actions without manual intervention
   - Event delivery is reliable and retryable

4. **Agent-Based Event Response**
   - Agents can create issues, comments, and pull requests in response to events
   - Agents can update repository state (labels, milestones, statuses)
   - Agents can trigger workflows and automated processes
   - Agents can analyze code changes and provide feedback

5. **Security & Access Control**
   - GitHub credentials are securely managed (encrypted storage, rotation)
   - Agent access is scoped to specific repositories or organizations
   - Webhook validation ensures authenticity of events
   - All agent interactions with GitHub are logged and auditable

### Success Criteria

- [ ] Agents can authenticate with GitHub API and list repositories in <500ms
- [ ] Repository creation takes <2s including validation
- [ ] Webhook event delivery and processing latency is <5s P99
- [ ] System supports >10,000 webhooks per agent organization
- [ ] 99.9% webhook delivery reliability (with retry mechanism)
- [ ] All GitHub operations are fully auditable with agent ID + timestamp
- [ ] GitHub credential storage is encrypted at rest
- [ ] Agent can process 100+ events/sec without bottleneck
- [ ] Zero data leakage between agents with different GitHub scopes

---

## 4. Target Users & Use Cases

### Target Users

1. **DevOps/Platform Engineers** — Automating repository and infrastructure management
2. **Development Teams** — Enabling agents to participate in development workflows
3. **Research Teams** — Using agents for code analysis and repository management
4. **Product Teams** — Automating issue tracking and PR review processes
5. **Open Source Maintainers** — Delegating routine maintenance to agents

### Key Use Cases

#### 4.1 Automated Repository Creation & Configuration
An internal agent creates new repositories for projects with standardized configurations (branch protection, webhooks, labels, team access). On creation, the agent configures issue templates, CI/CD workflows, and initial documentation.

**Workflow:**
```
Internal DevOps Agent
  ├─ Request: Create repository "project-alpha" in org
  ├─ Authenticate with GitHub
  ├─ Create repo with settings:
  │  ├─ Branch protection on main
  │  ├─ Require PR reviews
  │  ├─ Setup default labels
  │  └─ Add team collaborators
  ├─ Configure webhooks for agent processing
  └─ Return repo details + webhook URL
```

#### 4.2 Event-Driven Code Review & Triage
When a pull request is opened, GitHub webhook triggers agent. Agent reviews code changes, runs automated analysis, adds comments, and manages PR labels/assignments. Agent can approve, request changes, or escalate based on analysis.

**Workflow:**
```
GitHub Push/PR Event
  ├─ Webhook sends event to agent
  │
  ├─ Agent: Code Review Agent
  │  ├─ Download PR diff
  │  ├─ Analyze code quality, style, security
  │  ├─ Check against linting rules
  │  ├─ Post review comments on PR
  │  ├─ Apply labels (needs-review, approved, changes-requested)
  │  └─ Update PR description with analysis summary
  │
  └─ Return review status to GitHub
```

#### 4.3 Issue Triage & Automation
When issues are created, agent automatically categorizes them, adds labels, assigns to team members, and creates sub-tasks. Agent can analyze issue text to determine priority, complexity, and required expertise.

**Workflow:**
```
GitHub Issue Event
  ├─ Webhook: Issue created
  │
  ├─ Agent: Issue Triage Agent
  │  ├─ Parse issue description + metadata
  │  ├─ Extract priority, component, labels
  │  ├─ Run automated classification
  │  ├─ Assign to appropriate team member
  │  ├─ Create linked sub-issues if needed
  │  └─ Post initial response comment
  │
  └─ Issue is automatically triaged
```

#### 4.4 Release Management & Automation
When code is pushed to release branch, agent triggers release workflows. Agent generates release notes from commits, creates GitHub releases, tags repositories, and coordinates with deployment systems.

**Workflow:**
```
GitHub Push to release/* Event
  ├─ Webhook: Code pushed to release branch
  │
  ├─ Agent: Release Manager Agent
  │  ├─ Fetch commits since last release
  │  ├─ Generate release notes
  │  ├─ Create GitHub Release with notes
  │  ├─ Tag repository with version
  │  ├─ Trigger CI/CD pipelines
  │  └─ Notify teams via communication
  │
  └─ Release automated end-to-end
```

#### 4.5 Continuous Code Quality Monitoring
Agent monitors repository for code quality trends, runs periodic analysis on main branch, and reports on metrics (coverage, complexity, dependencies). Agent creates issues for quality regressions and triggers improvement workflows.

**Workflow:**
```
Scheduled Code Quality Check (via Cron)
  ├─ Agent: Code Quality Agent
  │  ├─ Pull main branch
  │  ├─ Run quality analysis tools
  │  ├─ Compare metrics to baseline
  │  ├─ Create issues for regressions
  │  ├─ Update repository stats
  │  └─ Report metrics to team
  │
  └─ Continuous quality monitoring
```

#### 4.6 Dependency Management & Updates
Agent monitors repository dependencies for updates and security vulnerabilities. Agent creates pull requests with dependency updates, runs test suites, and automatically merges if tests pass.

**Workflow:**
```
Scheduled Dependency Check
  ├─ Agent: Dependency Manager Agent
  │  ├─ Check for outdated dependencies
  │  ├─ Scan for security vulnerabilities
  │  ├─ Create PR with updates
  │  ├─ Monitor CI/CD test results
  │  ├─ Auto-merge if tests pass
  │  └─ Post summary comment
  │
  └─ Dependencies kept current
```

---

## 5. Feature Overview & Design

### 5.1 Core Concepts

#### GitHub Organization Scope
Defines which GitHub organization an agent has access to. Scoped at agent creation time.

**Scope entity:**
- `scopeId` — internal UUID, unique per agent
- `agentId` — which agent owns this scope
- `organizationName` — GitHub organization name (e.g., "mycompany")
- `accessToken` — encrypted GitHub Personal Access Token or OAuth token
- `permissions` — scoped permissions: `read:repos`, `write:repos`, `admin:org`, `admin:webhooks`
- `repositories` — optional allowlist of specific repos (null = all repos in org)
- `createdAt`, `expiresAt` — timestamps and expiration for token rotation

#### Repository Operations
CRUD operations agents can perform on repositories.

**Repository entity:**
- `repositoryId` — internal UUID
- `scopeId` — which GitHub access scope
- `gitHubUrl` — GitHub repository full URL
- `organizationName`, `repositoryName` — parsed from URL
- `description`, `topics` — metadata
- `visibility` — `public` or `private`
- `settings` — JSON object with branch protection, PR requirements, etc.
- `webhookUrl` — where GitHub sends events for this repo
- `webhookSecret` — HMAC secret for webhook validation
- `createdAt`, `updatedAt` — timestamps

#### GitHub Webhook Event
Event sent from GitHub to agent when repository activity occurs.

**Event entity:**
- `eventId` — internal UUID
- `repositoryId` — which repository
- `eventType` — `push`, `pull_request`, `issues`, `release`, `discussion`, etc.
- `payload` — raw GitHub webhook payload (JSON)
- `deliveredAt` — when webhook was delivered
- `processedAt` — when agent processed it
- `status` — `pending`, `processed`, `failed`, `retrying`
- `agentResponseId` — internal message ID from agent response (if any)

#### Agent GitHub Context
Metadata linking agent to GitHub access and repositories.

**Context entity:**
- `contextId` — internal UUID
- `agentId` — which agent
- `scopeId` — GitHub access scope
- `defaultRepositoryId` — default repo for operations (optional)
- `webhookAutomationEnabled` — boolean, controls webhook processing
- `eventProcessingMode` — `manual`, `automatic`, `batched`
- `lastEventProcessedAt` — timestamp
- `credentialRotationSchedule` — cron expression for token refresh

### 5.2 Architecture Overview

```
GitHub Organization
  │
  ├─ Webhook Events (push, PR, issues, etc.)
  │  │
  │  └─ → Webhook Receiver Service
  │     ├─ Validate signature
  │     ├─ Parse event
  │     ├─ Store in forge_github_events
  │     └─ Trigger wake queue
  │
  └─ API (via OAuth or PAT)
     │
     └─ ← Agent Tools
        ├─ authenticate(organization, token)
        ├─ createRepository({name, settings})
        ├─ updateRepository({id, settings})
        ├─ listRepositories()
        ├─ getRepository(id)
        ├─ deleteRepository(id)
        ├─ createIssue({repo, title, body})
        ├─ createPullRequest({repo, ...})
        ├─ getRepositoryEvents({repo, type, limit})
        ├─ postComment({repo, issue/pr, body})
        └─ updateIssueLabels({repo, issue, labels})

Internal Agent
  │
  ├─ Request: GitHub Operation (create repo, etc.)
  │  └─ → Agent Tool
  │     ├─ Load GitHub scope & credentials
  │     ├─ Validate permissions
  │     ├─ Call GitHub API
  │     ├─ Store operation log
  │     └─ Return result
  │
  └─ Receive: GitHub Webhook Event
     └─ ← Webhook Receiver
        ├─ Route event to agent
        ├─ Generate message from event
        ├─ Trigger wake queue
        └─ Agent processes and responds
```

### 5.3 Key Design Principles

1. **Organization Scoping** — Each agent is bound to a GitHub organization scope with explicit credentials and permissions. No cross-org access without separate scope.

2. **Event-Driven Activation** — Agents wake on webhook events via existing wake queue infrastructure. Events are routed as internal messages for consistency.

3. **Credential Security** — GitHub tokens stored encrypted at rest, rotated on schedule, never exposed to agent code. Validation on every API call.

4. **Webhook Reliability** — Webhooks validated via HMAC, stored persistently, and retried on failure. Event processing is idempotent.

5. **Audit Trail** — All GitHub operations logged with agent ID, timestamp, operation, and result. Webhook delivery tracked end-to-end.

6. **Rate Limiting** — GitHub API rate limits respected and enforced per scope. Agent requests queued if approaching limits.

7. **Error Resilience** — Failed API calls retried with exponential backoff. Webhook failures trigger retry logic without blocking other events.

---

## 6. Detailed Requirements

### 6.1 GitHub Organization Authentication

**Tool:** `authenticateGitHub()`
**Caller:** Admin/configuration process (not agents directly)
**Location:** `packages/mastra-engine/src/agent/github/auth.ts`

**Input:**
```typescript
interface AuthenticateGitHubRequest {
  agentId: string;                   // Which agent to grant access
  organizationName: string;          // GitHub organization
  accessToken: string;               // Personal Access Token or OAuth token
  permissions: GitHubPermission[];   // Scoped permissions
  repositories?: string[];           // Optional allowlist (null = all)
  tokenExpiresAt?: string;           // Optional expiration date
}

type GitHubPermission =
  | 'read:repos'      // List and read repos
  | 'write:repos'     // Create/update repos
  | 'admin:org'       // Manage organization
  | 'admin:webhooks'  // Create/manage webhooks
```

**Output:**
```typescript
interface AuthenticateGitHubResponse {
  scopeId: string;                   // Scope identifier
  agentId: string;
  organizationName: string;
  permissions: GitHubPermission[];
  repositoryAllowlist?: string[];
  authenticatedAt: string;
  tokenExpiresAt?: string;
  status: "active" | "invalid_token" | "insufficient_permissions";
}
```

**Behavior:**
1. Validate token by making test API call to GitHub
2. Verify requested permissions are available
3. Create GitHub scope record in database
4. Encrypt and store access token
5. If organization allowlist provided, validate repos exist
6. Register initial webhook infrastructure
7. Return scope ID for subsequent operations

**Requirements:**
- Token validation must happen before storage
- Token stored in encrypted form only (never in plaintext)
- Scope is immutable once created (recreate for changes)
- Token expiration tracked and monitored
- Invalid tokens rejected immediately

### 6.2 Repository Management

#### 6.2.1 Create Repository

**Tool:** `createGitHubRepository()`
**Caller:** Internal agents
**Location:** `packages/mastra-engine/src/agent/github/tools.ts`

**Input:**
```typescript
interface CreateGitHubRepositoryRequest {
  repositoryName: string;            // Name for new repo
  description?: string;              // Repository description
  visibility: 'public' | 'private';  // Visibility
  settings?: {
    requirePullRequestReviews?: boolean;
    requiredApprovingReviewCount?: number;  // default: 1
    requireStatusChecks?: boolean;
    autoDeleteHeadBranches?: boolean;
    allowSquashMerge?: boolean;
    allowMergeCommit?: boolean;
    allowRebaseCommit?: boolean;
    defaultBranch?: string;           // default: 'main'
    topics?: string[];
    issues?: boolean;
    projects?: boolean;
    wiki?: boolean;
  };
}
```

**Output:**
```typescript
interface CreateGitHubRepositoryResponse {
  repositoryId: string;              // Internal ID
  repositoryName: string;
  gitHubUrl: string;                 // Full GitHub URL
  organizationName: string;
  webhookUrl: string;                // Where GitHub sends events
  settings: Record<string, unknown>;  // Applied settings
  createdAt: string;
  status: "created" | "configuration_failed";
}
```

**Behavior:**
1. Validate repository name (not duplicate in org)
2. Call GitHub API to create repository
3. Apply requested settings via API
4. Create webhook receiver endpoint
5. Store repository record in database
6. Generate webhook secret (HMAC)
7. Return repository info with webhook details
8. If settings fail, creation succeeds but settings partial

**Error Handling:**
- Duplicate name: return error
- Invalid visibility: return validation error
- API quota exceeded: queue for later retry
- Invalid settings: apply partial, return warnings

#### 6.2.2 List Repositories

**Tool:** `listGitHubRepositories()`

**Input:**
```typescript
interface ListGitHubRepositoriesRequest {
  type?: 'all' | 'public' | 'private';  // Filter
  sort?: 'updated' | 'created' | 'name';
  limit?: number;                     // default: 30
  offset?: number;
}
```

**Output:**
```typescript
interface ListGitHubRepositoriesResponse {
  repositories: Array<{
    repositoryId: string;
    repositoryName: string;
    gitHubUrl: string;
    description?: string;
    visibility: 'public' | 'private';
    createdAt: string;
    updatedAt: string;
    webhookConfigured: boolean;
  }>;
  total: number;
  hasMore: boolean;
}
```

#### 6.2.3 Get Repository Details

**Tool:** `getGitHubRepository()`

**Input:**
```typescript
interface GetGitHubRepositoryRequest {
  repositoryId?: string;              // Internal ID
  repositoryName?: string;            // GitHub name (requires org from scope)
}
```

**Output:**
```typescript
interface GetGitHubRepositoryResponse {
  repositoryId: string;
  repositoryName: string;
  gitHubUrl: string;
  description?: string;
  visibility: 'public' | 'private';
  stats: {
    stars: number;
    watchers: number;
    forks: number;
    openIssues: number;
  };
  settings: Record<string, unknown>;
  webhookConfigured: boolean;
  lastActivityAt?: string;
}
```

#### 6.2.4 Update Repository Settings

**Tool:** `updateGitHubRepository()`

**Input:**
```typescript
interface UpdateGitHubRepositoryRequest {
  repositoryId: string;
  settings: {
    description?: string;
    visibility?: 'public' | 'private';
    requirePullRequestReviews?: boolean;
    requiredApprovingReviewCount?: number;
    topics?: string[];
    autoDeleteHeadBranches?: boolean;
    // ... other settings
  };
}
```

**Output:**
```typescript
interface UpdateGitHubRepositoryResponse {
  repositoryId: string;
  settings: Record<string, unknown>;
  updatedAt: string;
  partialFailures?: Array<{
    setting: string;
    error: string;
  }>;
}
```

#### 6.2.5 Delete Repository

**Tool:** `deleteGitHubRepository()`

**Input:**
```typescript
interface DeleteGitHubRepositoryRequest {
  repositoryId: string;
  confirmName: string;               // Require confirmation of repo name
}
```

**Output:**
```typescript
interface DeleteGitHubRepositoryResponse {
  success: boolean;
  repositoryId: string;
  deletedAt: string;
}
```

### 6.3 Repository Event Webhooks

#### 6.3.1 Webhook Configuration

Webhooks are configured automatically on repository creation. Agents receive events as internal messages.

**Webhook Configuration:**
- **Events Subscribed:** push, pull_request, issues, release, discussion, workflow_run
- **Content Type:** application/json
- **TLS Verification:** Required (HTTPS only)
- **Delivery Retry:** Automatic retry on HTTP errors (5xx, timeout)
- **Signature:** HMAC SHA256 (GitHub sends `X-Hub-Signature-256` header)

**Webhook Receiver:**
Located at: `packages/mastra-engine/src/agent/github/webhook-receiver.ts`

**Verification:**
```typescript
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  const hash = 'sha256=' + hmac.update(payload).digest('hex');
  return timingSafeEqual(hash, signature);
}
```

#### 6.3.2 Event Routing

When webhook is received:

1. **Verify Signature** — Validate GitHub signature against stored secret
2. **Parse Event** — Extract event type, repository, and payload
3. **Store Event** — Record in `forge_github_events` table
4. **Generate Message** — Create internal message with event summary
5. **Route to Agent** — Send via internal chat provider
6. **Trigger Wake** — Wake agent via wake queue
7. **Process** — Agent receives message and responds

**Event Message Format:**
```
GitHub Event: [EVENT_TYPE]

Repository: [org/repo]
Event Time: [ISO timestamp]

Details:
[Event-specific details extracted from payload]

---
Process this event as needed. Respond with actions or analysis.
```

**Example: Pull Request Event Message:**
```
GitHub Event: pull_request

Repository: myorg/myrepo
Event: opened
Event Time: 2026-03-16T10:30:00Z

Details:
PR #42: "Add new feature"
Author: developer
Changes: +150 -30 lines
Base: main
Target: feature branch

---
Process this event as needed. Respond with actions or analysis.
```

### 6.4 Agent GitHub Tools

#### 6.4.1 Issues & Pull Requests

**Tool:** `createGitHubIssue()`

```typescript
interface CreateGitHubIssueRequest {
  repositoryId?: string;              // Uses default if omitted
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  milestone?: string;
}

interface CreateGitHubIssueResponse {
  issueNumber: number;
  gitHubUrl: string;
  createdAt: string;
}
```

**Tool:** `createGitHubPullRequest()`

```typescript
interface CreateGitHubPullRequestRequest {
  repositoryId?: string;
  title: string;
  body?: string;
  headBranch: string;                 // Source branch
  baseBranch?: string;                // Target (default: main)
  draft?: boolean;
  labels?: string[];
  assignees?: string[];
}

interface CreateGitHubPullRequestResponse {
  prNumber: number;
  gitHubUrl: string;
  status: "open" | "draft";
  createdAt: string;
}
```

#### 6.4.2 Comments & Reactions

**Tool:** `postGitHubComment()`

```typescript
interface PostGitHubCommentRequest {
  repositoryId?: string;
  issueNumber: number;                // Works for both issues and PRs
  body: string;
}

interface PostGitHubCommentResponse {
  commentId: number;
  gitHubUrl: string;
  createdAt: string;
}
```

#### 6.4.3 Issue & PR Management

**Tool:** `updateGitHubIssue()`

```typescript
interface UpdateGitHubIssueRequest {
  repositoryId?: string;
  issueNumber: number;
  title?: string;
  body?: string;
  labels?: string[];                  // Replace all labels
  state?: 'open' | 'closed';
  assignees?: string[];
  milestone?: string;
}

interface UpdateGitHubIssueResponse {
  issueNumber: number;
  state: 'open' | 'closed';
  updatedAt: string;
}
```

### 6.5 Event Processing

#### 6.5.1 Event Storage Schema

Location: `packages/mastra-engine/src/agent/github/store.ts`

```sql
CREATE TABLE forge_github_scopes (
  scope_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  permissions JSON NOT NULL,  -- ["read:repos", "write:repos", ...]
  repositories_allowlist JSON,  -- null = all repos, or array of repo names
  created_at TEXT NOT NULL,
  expires_at TEXT,
  metadata JSON,
  UNIQUE(agent_id, organization_name)
);

CREATE TABLE forge_github_repositories (
  repository_id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  github_url TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  repository_name TEXT NOT NULL,
  description TEXT,
  visibility TEXT,  -- 'public', 'private'
  settings JSON,
  webhook_url TEXT,
  webhook_secret_encrypted TEXT,
  webhook_last_delivery_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (scope_id) REFERENCES forge_github_scopes,
  UNIQUE(scope_id, repository_name)
);

CREATE TABLE forge_github_events (
  event_id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  event_type TEXT NOT NULL,  -- 'push', 'pull_request', 'issues', ...
  event_number INTEGER,  -- PR or issue number if applicable
  payload JSON NOT NULL,
  delivered_at TEXT,
  processed_at TEXT,
  status TEXT,  -- 'pending', 'processed', 'failed', 'retrying'
  agent_response_id TEXT,  -- Internal message ID if agent responded
  retry_count INTEGER DEFAULT 0,
  next_retry_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (repository_id) REFERENCES forge_github_repositories
);

CREATE TABLE forge_github_audit_log (
  log_id TEXT PRIMARY KEY,
  scope_id TEXT,
  repository_id TEXT,
  agent_id TEXT NOT NULL,
  operation TEXT,  -- 'create_repo', 'create_issue', 'post_comment', etc.
  details JSON,
  status TEXT,  -- 'success', 'failure'
  error_message TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (scope_id) REFERENCES forge_github_scopes,
  FOREIGN KEY (repository_id) REFERENCES forge_github_repositories
);
```

#### 6.5.2 Webhook Delivery & Retry

When webhook is received but agent fails to process:

**Retry Policy:**
- First attempt: Immediate
- Retry 1: 5 seconds
- Retry 2: 30 seconds
- Retry 3: 5 minutes
- Retry 4: 30 minutes
- Retry 5: 2 hours
- Max retries: 5 (total ~2.5 hours of retry window)

**Failure Handling:**
- Store event with status `failed`
- Log error with context
- Schedule next retry
- Do not block subsequent events
- Alert if critical (e.g., webhook secret invalid)

### 6.6 Security & Credential Management

#### 6.6.1 Token Storage

**Encryption:**
- All access tokens stored encrypted at rest using AES-256-GCM
- Encryption key stored in environment (`GITHUB_TOKEN_KEY`)
- Token never logged or exposed in any form

**Rotation:**
- Tokens tracked with expiration date
- Expired tokens blocked from API use
- Agents notified when token nearing expiration
- Manual re-authentication required for expired tokens

#### 6.6.2 Rate Limiting

GitHub enforces rate limits per token:
- Primary rate limit: 5,000 requests per hour
- Secondary rate limit: 100 concurrent requests
- Search API limit: 30 queries per minute

**Rate Limit Handling:**
```typescript
interface GitHubRateLimit {
  limit: number;
  remaining: number;
  resetAt: string;  // Unix timestamp
}

// Before API call:
if (rateLimit.remaining < 100) {
  queue_for_later_retry();  // Wait until resetAt
}
```

#### 6.6.3 Webhook Validation

Every webhook validated before processing:

```typescript
function validateWebhook(
  payload: string,
  signature: string,
  secret: string
): {valid: boolean, error?: string} {
  try {
    // 1. Verify signature format
    if (!signature.startsWith('sha256=')) {
      return {valid: false, error: 'Invalid signature format'};
    }

    // 2. Compute HMAC
    const hmac = crypto.createHmac('sha256', secret);
    const expected = 'sha256=' + hmac.update(payload).digest('hex');

    // 3. Constant-time comparison
    if (!timingSafeEqual(expected, signature)) {
      return {valid: false, error: 'Signature mismatch'};
    }

    return {valid: true};
  } catch (error) {
    return {valid: false, error: error.message};
  }
}
```

---

## 7. Implementation Plan

### Phase 1: Foundation (Week 1-2)
- [ ] Create GitHub scope and repository schemas
- [ ] Implement `authenticateGitHub()` function
- [ ] Create GitHub API client wrapper with rate limiting
- [ ] Implement token encryption/decryption
- [ ] Create store layer for GitHub data
- [ ] Write unit tests for auth and store

### Phase 2: Repository Management (Week 2-3)
- [ ] Implement repository CRUD tools
- [ ] Add GitHub API integration for repo operations
- [ ] Implement permission validation
- [ ] Add audit logging
- [ ] Write integration tests for repo operations

### Phase 3: Webhook Infrastructure (Week 3-4)
- [ ] Create webhook receiver endpoint
- [ ] Implement webhook signature validation
- [ ] Create event storage and routing
- [ ] Integrate with internal chat provider
- [ ] Implement event retry logic
- [ ] Write webhook tests

### Phase 4: Agent Tools (Week 4-5)
- [ ] Implement issue/PR creation tools
- [ ] Implement comment tools
- [ ] Implement issue update tools
- [ ] Add event fetching tools
- [ ] Write integration tests for tools

### Phase 5: Testing & Documentation (Week 5-6)
- [ ] Performance testing (API latency, webhook throughput)
- [ ] Security audit (credential handling, permissions)
- [ ] Load testing (concurrent operations, rate limits)
- [ ] Documentation and examples
- [ ] Runbooks for token rotation

---

## 8. Data Flow & Interactions

### Repository Creation Flow
```
Internal Agent
  │
  └─ tool call: createGitHubRepository({
       repositoryName: "project-alpha",
       settings: { requirePullRequestReviews: true }
     })
     │
     ├─ Load agent's GitHub scope
     ├─ Validate permission: write:repos
     ├─ Call GitHub API: Create repo
     ├─ Apply settings via API
     ├─ Generate webhook secret
     ├─ Create webhook receiver
     ├─ Store in forge_github_repositories
     ├─ Log to forge_github_audit_log
     └─ Return repo details + webhook URL
```

### Webhook Event Flow
```
GitHub Organization
  │
  └─ Event: PR opened in "project-alpha"
     │
     └─ POST to webhook URL
        │
        ├─ Webhook Receiver
        │  ├─ Verify HMAC signature
        │  ├─ Parse event payload
        │  ├─ Store in forge_github_events (status: pending)
        │  └─ Create internal message
        │
        ├─ Communication Module
        │  ├─ Route message to agent
        │  ├─ Mark as unread
        │  └─ Store conversation
        │
        ├─ Wake Queue
        │  └─ Wake agent (if dormant)
        │
        └─ Internal Agent
           │
           └─ agent.generate() with:
              "GitHub Event: pull_request
               PR #42: Add new feature
               ..."
              │
              └─ Agent response:
                 tool call: postGitHubComment({
                   issueNumber: 42,
                   body: "Looks good, checking..."
                 })
                 │
                 ├─ Post comment via GitHub API
                 ├─ Update forge_github_events
                 │  └─ status: processed
                 │     agent_response_id: <message_id>
                 └─ Log to forge_github_audit_log
```

### Event Retry Flow
```
GitHub Webhook Event
  │
  ├─ Delivery attempt 1: FAIL (timeout)
  │  ├─ Store status: failed
  │  ├─ Set retry_count: 1
  │  ├─ Set next_retry_at: +5 seconds
  │  └─ Log error
  │
  ├─ [5 seconds pass]
  │
  ├─ Delivery attempt 2: Manual retry from queue
  │  ├─ Query forge_github_events WHERE next_retry_at <= now
  │  ├─ Re-trigger webhook processing
  │  ├─ Update retry_count: 2
  │  ├─ Set next_retry_at: +30 seconds
  │  └─ Log retry
  │
  └─ [Continue up to 5 retries]
```

---

## 9. API Reference

### authenticateGitHub()

**Type:** Configuration function (not agent tool)
**Module:** `packages/mastra-engine/src/agent/github/auth.ts`
**Availability:** Configuration/admin interface

```typescript
async function authenticateGitHub(
  input: AuthenticateGitHubRequest
): Promise<AuthenticateGitHubResponse>
```

### createGitHubRepository()

**Type:** Agent tool
**Module:** `packages/mastra-engine/src/agent/github/tools.ts`

```typescript
tool.createGitHubRepository({
  repositoryName: "my-project",
  description: "Project description",
  visibility: "private",
  settings: {
    requirePullRequestReviews: true,
    requiredApprovingReviewCount: 2,
    autoDeleteHeadBranches: true
  }
}): Promise<CreateGitHubRepositoryResponse>
```

### listGitHubRepositories()

```typescript
tool.listGitHubRepositories({
  type: "private",
  sort: "updated",
  limit: 20
}): Promise<ListGitHubRepositoriesResponse>
```

### createGitHubIssue()

```typescript
tool.createGitHubIssue({
  repositoryId: "repo-id",
  title: "Bug: Login fails",
  body: "Steps to reproduce...",
  labels: ["bug", "critical"],
  assignees: ["developer"]
}): Promise<CreateGitHubIssueResponse>
```

### createGitHubPullRequest()

```typescript
tool.createGitHubPullRequest({
  repositoryId: "repo-id",
  title: "Feature: Add dark mode",
  body: "Implementation of dark mode...",
  headBranch: "feature/dark-mode",
  baseBranch: "main"
}): Promise<CreateGitHubPullRequestResponse>
```

### postGitHubComment()

```typescript
tool.postGitHubComment({
  repositoryId: "repo-id",
  issueNumber: 42,
  body: "Review comment..."
}): Promise<PostGitHubCommentResponse>
```

### getGitHubRepository()

```typescript
tool.getGitHubRepository({
  repositoryId: "repo-id"
}): Promise<GetGitHubRepositoryResponse>
```

### updateGitHubRepository()

```typescript
tool.updateGitHubRepository({
  repositoryId: "repo-id",
  settings: {
    description: "Updated description",
    visibility: "public"
  }
}): Promise<UpdateGitHubRepositoryResponse>
```

---

## 10. Configuration & Deployment

### Environment Variables

```bash
# GitHub Integration Configuration
GITHUB_WEBHOOK_RECEIVER_URL=https://api.example.com/webhooks/github
GITHUB_API_VERSION=2022-11-28
GITHUB_TOKEN_KEY=<encryption_key_for_token_storage>
GITHUB_RATE_LIMIT_BUFFER=100  # requests to keep in reserve

# Webhook Configuration
GITHUB_WEBHOOK_MAX_RETRIES=5
GITHUB_WEBHOOK_INITIAL_RETRY_DELAY_MS=5000
GITHUB_WEBHOOK_BATCH_SIZE=50

# API Configuration
GITHUB_API_TIMEOUT_MS=30000
GITHUB_API_MAX_CONCURRENT_REQUESTS=10
```

### Monitoring & Observability

**Metrics:**
- `github_api_requests_total` — counter, labeled with endpoint, status
- `github_api_latency_ms` — histogram of API call latency
- `github_webhook_deliveries_total` — counter, labeled with event_type, status
- `github_webhook_retry_count` — histogram of retry attempts
- `github_webhook_processing_latency_ms` — histogram of event processing time
- `github_rate_limit_remaining` — gauge of remaining API quota
- `github_active_scopes` — gauge of authenticated agents
- `github_repositories_total` — gauge of managed repositories

**Logs:**
- API calls: `[GITHUB_API] {endpoint} {status} {latency_ms}`
- Webhooks: `[GITHUB_WEBHOOK] {event_type} {event_number} delivered`
- Errors: `[GITHUB_ERROR] {operation}: {error_message}`
- Rate limit: `[GITHUB_RATE_LIMIT] Remaining: {remaining}/{limit}`

**Audit Trail:**
All operations logged to `forge_github_audit_log`:
- Agent ID, timestamp, operation, status, error (if any)
- Enables full traceability of agent-driven repository changes

### Deployment Considerations

1. **Webhook Endpoint:** Must be publicly accessible HTTPS URL
2. **Token Management:** Implement automated token rotation schedule
3. **Rate Limiting:** Monitor GitHub API quota and queue requests accordingly
4. **Failover:** Webhook events retried automatically; no manual intervention needed
5. **Backup:** Audit log backed up regularly for compliance

---

## 11. Testing Strategy

### Unit Tests

**Authentication:**
- ✅ Valid token accepted and stored encrypted
- ✅ Invalid token rejected
- ✅ Insufficient permissions detected
- ✅ Token encryption/decryption works

**Repository Operations:**
- ✅ Create repo with valid settings
- ✅ Duplicate repo name rejected
- ✅ Settings validation works
- ✅ Update repo settings
- ✅ Delete repo with confirmation

**Webhooks:**
- ✅ Valid signature accepted
- ✅ Invalid signature rejected
- ✅ Event parsing works for all types
- ✅ Event storage succeeds
- ✅ Retry logic queues failed events

### Integration Tests

**API Integration:**
- ✅ Authenticate with real GitHub API (test organization)
- ✅ Create/update/delete repositories
- ✅ Rate limiting respected
- ✅ Error responses handled correctly

**Agent Tool Integration:**
- ✅ Agent can call repository tools
- ✅ Issues and PRs created successfully
- ✅ Comments posted to issues
- ✅ Audit log entries created
- ✅ Multiple agents don't interfere

**Webhook Processing:**
- ✅ Webhook received and processed
- ✅ Agent receives event as message
- ✅ Agent response stored correctly
- ✅ Retry mechanism works on failure

### End-to-End Tests

**Scenario: Automated Repository Setup**
1. Authenticate with GitHub organization
2. Create repository with custom settings
3. Create initial issues
4. Add labels and milestones
5. Verify repository configured correctly

**Scenario: Issue Triage on Webhook Event**
1. Create repository with webhook
2. Trigger webhook event (issue created)
3. Agent receives event
4. Agent analyzes and adds labels
5. Verify GitHub reflects agent's changes

**Scenario: PR Review Automation**
1. Create repository with webhook
2. Push branch and open PR
3. Agent receives PR event
4. Agent analyzes code changes
5. Agent posts review comment
6. Verify comment visible in GitHub

---

## 12. Risks & Mitigation

| Risk | Impact | Mitigation |
| --- | --- | --- |
| **Token Compromise** | Attacker gains repo access | Encrypt tokens at rest, rotate regularly, validate signatures |
| **Webhook Injection** | Malicious events trigger agent | Verify HMAC signatures on all webhooks, validate payload structure |
| **Rate Limit Exceeded** | API calls fail, agent blocked | Queue requests, monitor quota, cache responses |
| **Webhook Delivery Failure** | Events lost, out-of-sync state | Persistent storage, retry logic with exponential backoff |
| **Unauthorized API Access** | Agent accesses repos outside scope | Permission validation on every call, scope-based filtering |
| **Token Rotation Miss** | Expired token breaks workflows | Track expiration, warn agents, block API calls on expiry |
| **Webhook Endpoint Down** | GitHub can't deliver events | Health checks, fallback delivery queue, GitHub status monitoring |
| **Cross-Agent Data Leakage** | Agents access each other's data | Strict scope isolation, separate credentials per org |
| **Audit Log Loss** | No record of agent actions | Durable storage, backup retention policy |

---

## 13. Future Enhancements

### Short Term (1-2 Sprints)
- [ ] GitHub Actions workflow triggering from agents
- [ ] Releases and tags management
- [ ] Branch protection rule management
- [ ] Repository teams and access management
- [ ] GitHub status checks and deployment API
- [ ] Discussion API integration

### Medium Term (2-3 Sprints)
- [ ] Gists and file management
- [ ] GitHub Projects integration
- [ ] Advanced code search API
- [ ] Repository insights and analytics API
- [ ] GitHub Apps integration (instead of PAT)
- [ ] Multi-organization scope per agent

### Long Term (3+ Sprints)
- [ ] CI/CD pipeline integration (GitHub Actions)
- [ ] Custom GitHub webhooks UI
- [ ] Agent-triggered releases and deployments
- [ ] GraphQL API support for more complex queries
- [ ] Repository template system with agent customization
- [ ] GitHub Marketplace app development
- [ ] Compliance reporting and governance integration

---

## Appendix A: Example: Automated PR Review

```typescript
// Internal Code Review Agent
const reviewAgent = await createAgent({
  id: 'code-review-001',
  instructions: 'You are a code review expert. Analyze PRs for quality...',
  model: 'claude-opus',
});

// GitHub authentication happens once (admin step)
await authenticateGitHub({
  agentId: 'code-review-001',
  organizationName: 'mycompany',
  accessToken: process.env.GITHUB_TOKEN,
  permissions: ['read:repos', 'write:repos', 'admin:webhooks']
});

// Agent is now listening for webhook events from all repos

// When PR is opened, GitHub sends webhook event
// Webhook receiver creates internal message:
// "GitHub Event: pull_request
//  PR #42: Add authentication feature
//  Author: developer
//  ..."

// Agent processes the event:
const prAnalysis = await reviewAgent.generate({
  messages: [
    {
      role: 'user',
      content: `GitHub Event: pull_request
      PR #42: Add authentication feature
      Changes: +500 -50 lines
      Files: auth.ts, api.ts, tests.ts`
    }
  ]
});

// Agent responds with review:
// Let me analyze this PR...
// I'll run security checks, style analysis, etc.
// Then post feedback.

// Agent posts review comment:
const response = await reviewAgent.tool('postGitHubComment', {
  repositoryId: 'repo-xyz',
  issueNumber: 42,
  body: `## Code Review

### Security ✅
- Input validation looks good
- No SQL injection vulnerabilities found

### Style ⚠️
- Some functions exceed recommended length (>50 lines)
- Consider breaking into smaller utilities

### Tests ✅
- Good coverage for new auth logic
- All edge cases covered

### Verdict: Approved with minor suggestions`
});

// GitHub comment posted automatically
```

---

## Appendix B: Webhook Event Examples

### Push Event
```json
{
  "ref": "refs/heads/main",
  "before": "abc123...",
  "after": "def456...",
  "repository": {
    "id": 123456,
    "name": "my-repo",
    "full_name": "myorg/my-repo"
  },
  "pusher": {
    "name": "developer"
  },
  "commits": [
    {
      "id": "def456...",
      "message": "Fix: Auth bug",
      "author": {"name": "developer"}
    }
  ]
}
```

### Pull Request Event
```json
{
  "action": "opened",
  "number": 42,
  "pull_request": {
    "id": 654321,
    "title": "Add dark mode",
    "body": "Implements dark theme...",
    "user": {"login": "developer"},
    "head": {"ref": "feature/dark-mode"},
    "base": {"ref": "main"},
    "changed_files": 15,
    "additions": 350,
    "deletions": 45
  }
}
```

### Issues Event
```json
{
  "action": "opened",
  "issue": {
    "number": 99,
    "title": "Bug: Login fails",
    "body": "Steps to reproduce...",
    "user": {"login": "user"},
    "labels": []
  }
}
```

---

**Document Version:** 1.0
**Last Review:** 2026-03-15
**Next Review:** 2026-04-15
