# PRD-16: GitHub Organization Integration

**Status:** Partially Implemented
**Classification:** FORGE APP

## 1. Goal

Connect internal agents to one GitHub Organization through one GitHub App per internal agent so they can operate repositories and receive GitHub events.

This PRD is about:
- GitHub App identity for each internal agent
- repository operations performed through the agent's own GitHub App
- agent-specific GitHub webhook endpoints
- agent notifications created from relevant GitHub events

It is not about deployment, monitoring, or a generic webhook routing bus.

## 2. Core Direction

The system uses:
- one GitHub App per internal agent
- one installation of that app in the company organization
- organization-wide repository access in the first version
- GitHub App installation tokens for API and Git HTTPS operations

This is not a per-user GitHub account model.
It is a per-agent GitHub App identity model.

## 3. Scope

### Included
- create one GitHub App per internal agent
- install that GitHub App in the company organization
- store GitHub App credentials in encrypted agent provider/integration storage
- generate Git HTTPS credentials for the agent
- perform basic GitHub API operations through the agent app
- receive GitHub webhook events on an agent-specific endpoint
- create generic agent notifications from relevant GitHub webhook events

### Excluded
- deployment to infrastructure
- runtime monitoring of deployed apps
- generic webhook routing bus
- repository-level access scoping
- GitHub user accounts per agent
- advanced GitHub administration

## 4. Authentication Model

Required persisted data for one agent GitHub App:
- `appId`
- `privateKey`
- `installationId`
- `webhookSecret`
- `appSlug`

Authentication flow:
1. authenticate as app with `appId + privateKey`
2. request installation token for `installationId`
3. use that token for GitHub API and Git HTTPS operations

The preferred client layer is Octokit.

## 5. Webhook Model

Each agent GitHub App registers its own endpoint.

Initial direction:
- `GET /github/apps/{agentId}/register`
- `GET /github/apps/{agentId}/manifest/callback`
- `GET /github/apps/{agentId}/setup`
- `POST /webhooks/github/{agentId}`

This means:
- the endpoint path already identifies the agent
- no extra app-to-agent routing table is needed for webhook delivery
- webhook validation uses the `webhookSecret` stored in the agent's private GitHub integration credentials

Relevant GitHub events create generic agent notifications and trigger the wake flow.

## 6. Notification Model

GitHub events do not create communication messages.
They create generic agent notifications.

Suggested minimum fields:
- `id`
- `agentId`
- `content`
- `createdAt`
- `readAt`

`content` may store compact JSON with:
- `source`
- `event`
- `action`
- `repository`
- `sender`
- `payload`

This table is generic and can be reused by other notification-producing systems later.

## 7. Storage Boundary

GitHub App credentials do **not** belong in communication `accounts`.

Boundary:
- communication `accounts` = identity for messaging providers and contacts
- encrypted agent provider/integration storage = private credentials for external systems such as GitHub Apps

So GitHub App credentials belong in the encrypted agent provider/integration storage already used by the app.

## 8. Initial Functional Surface

### 8.1 Hiring Provisioning
The hiring workflow provisions a pending GitHub App integration for the new agent and returns a registration URL.

### 8.2 Git HTTPS Credentials
The agent can request short-lived Git HTTPS credentials for its own GitHub App installation.

### 8.3 Repository Operations
Initial explicit operations:
- list repositories
- create repository
- get repository
- list pull requests
- create pull request

### 8.4 Webhook Event Intake
Relevant webhook events create agent notifications and wake the agent.

## 9. Design Rules

- each internal agent has its own GitHub App
- each GitHub App starts with organization-wide repository access
- repository ownership still belongs to the company organization
- Git operations use Git HTTPS with installation token, not SSH token
- GitHub App credentials stay encrypted and internal to the app
- GitHub webhook events become generic agent notifications
- this PRD does not define deployment

## 10. Success Criteria

- a hired internal agent receives a GitHub App provisioning flow
- agent GitHub credentials are stored securely
- the agent can generate Git HTTPS credentials for bash/git usage
- the agent can perform the initial GitHub API operations through its own app
- GitHub webhook events for that app reach the correct agent endpoint
- those webhook events create notifications and trigger wake

## 11. Implementation Status

Implemented today:
- encrypted storage for GitHub App credentials can live in `agent_providers`
- hiring now provisions a pending GitHub App integration per new agent
- hiring returns `githubAppRegistrationUrl`
- a per-agent GitHub App manager exists in the Forge app runtime
- the app now starts an HTTP server for GitHub App and webhook endpoints
- agent-specific routes exist for:
  - registration page
  - manifest callback
  - install/setup callback
  - webhook receipt
- generic `agent_notifications` storage exists
- agents now have tools for:
  - listing/reading/marking notifications
  - generating Git HTTPS credentials
  - listing repositories
  - creating repositories
  - getting repository metadata
  - listing pull requests
  - creating pull requests
- relevant GitHub webhooks create notifications and trigger wake

Still pending:
- completing the real GitHub manifest/install flow in a live configured environment
- application registry and application-to-repository linkage
- any deployment integration on top of repository ownership
