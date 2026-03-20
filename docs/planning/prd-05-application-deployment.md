# PRD-05: Coolify Application Deployment

**Status:** Planned
**Classification:** FORGE APP

## 1. Goal

Deploy company applications through **Coolify** after those applications already exist in Forge and already have a linked source repository.

This PRD is about:
- Coolify integration
- deployment records inside Forge
- deployment administration tools for internal agents
- deployment status tracking
- deployment webhook notifications

It is not about creating repositories or defining application ownership.

## 2. Dependency

This PRD depends on the application and repository layer existing first.

A deployment must start from:
- an existing application record in Forge
- an existing linked repository
- known repository metadata inside the app

Deployment does not start from raw ad-hoc Coolify or repository input.

## 3. Scope

### Included
- connect Forge to one Coolify instance
- create and manage deployed applications through Coolify
- persist deployment records inside Forge
- expose deployment administration tools to internal agents
- receive Coolify webhook events
- convert relevant Coolify events into generic agent notifications
- wake the responsible agent when relevant deployment events arrive

### Excluded
- multi-provider deployment orchestration
- generic webhook bus design
- customer billing and hosting plans
- full observability platform
- repository creation or source authoring workflows

## 4. Core Direction

The first version is **Coolify-specific**, not deployment-provider-agnostic.

That means:
- one Forge deployment integration
- one Coolify instance/company account
- one set of company-level Coolify admin credentials
- one direct adapter for Coolify API + Coolify webhooks

This keeps the first version small and avoids inventing an abstraction before there is a second deployment provider.

## 5. Core Concepts

### 5.1 Company Application
A persistent application record in Forge.

### 5.2 Coolify Application
The application/resource created in Coolify for one Forge application.

### 5.3 Deployment Record
A persistent deployment record stored in Forge.

This represents one deployment attempt or active deployment for one Forge application.

### 5.4 Deployment Notification
A generic agent notification created from a relevant Coolify webhook event.

Coolify webhook events do not become communication messages.
They become `agent_notifications` entries and trigger wake.

## 6. Initial Functional Surface

### 6.1 Deploy Application
Trigger deployment for one existing Forge application.

Example input shape:
```ts
{
  applicationId: string;
  requestedByAgentId?: string;
  branch?: string;
  commitSha?: string;
}
```

Example output shape:
```ts
{
  deploymentId: string;
  applicationId: string;
  status: 'queued' | 'building' | 'deploying' | 'running' | 'failed';
  url?: string;
}
```

### 6.2 Get Deployment Status
Return one deployment with current status.

### 6.3 List Application Deployments
Return deployments for one Forge application.

### 6.4 Remove Deployment
Stop, remove, or deactivate the deployed application in Coolify and update Forge state.

### 6.5 Administration Tools
Expose a small set of Coolify administration tools to internal agents.

Initial direction:
- create Coolify application for one Forge application
- trigger deployment
- get deployment status
- list deployments
- get deployed URL
- stop/remove deployment

These are administration tools for the company deployment layer.
They are not raw generic Coolify API passthrough tools.

## 7. Webhook Direction

Coolify webhook events should be treated the same way GitHub events are treated conceptually:
- adapter-specific endpoint
- signature validation if available
- persist deployment state updates
- create generic agent notification when relevant
- wake the responsible agent

Initial route direction:
- `POST /webhooks/coolify/{applicationId}`

Why `applicationId`:
- deployment events belong to the company application lifecycle
- the Forge application already knows which agent is responsible
- this keeps routing explicit and simple

This PRD does **not** depend on the generic webhook routing bus from `PRD-33`.

## 8. Notification Direction

Relevant Coolify webhook events create `agent_notifications` entries.

Suggested content shape:
- `source: 'coolify'`
- `event`
- `applicationId`
- `deploymentId?`
- `status?`
- `url?`
- `error?`
- compact provider payload when necessary

The notification table already exists and should be reused.

## 9. Monitoring Direction

Monitoring stays deployment-focused.

That means:
- current deployment status
- latest deployment timestamps
- last deployment error
- current deployed URL
- whether the app is running or failed

This is not application metrics, tracing, or logs platform design.

## 10. Data Model Direction

### `application_deployments`
Suggested minimum fields:
- `id`
- `applicationId`
- `requestedByAgentId`
- `status`
- `provider` = `coolify`
- `providerApplicationId`
- `providerDeploymentId?`
- `branch`
- `commitSha`
- `url`
- `errorMessage`
- `createdAt`
- `updatedAt`
- `completedAt`

### Application-side Coolify linkage
One Forge application should also persist the minimum Coolify linkage needed to manage it later.

Suggested fields or related record:
- `applicationId`
- `coolifyApplicationId`
- `coolifyProjectId?`
- `coolifyEnvironmentId?`
- `coolifyServerId?`

The first version should keep this minimal and only store what the adapter really needs.

## 11. Company Credential Boundary

Coolify admin credentials are company-level integration credentials.
They do not belong to agent communication accounts and do not belong to per-agent runtime provider credentials.

Boundary:
- communication `accounts` = messaging/contact identity only
- `agent_providers` = per-agent runtime credentials
- Coolify admin credentials = company integration secret used by the deployment adapter

This PRD does not yet define the final storage mechanism for that company credential. It only defines the integration boundary.

## 12. Design Rules

- the first version is Coolify-specific
- deployment starts from a Forge application, not raw provider IDs
- deployment state is persisted in Forge
- webhook handling stays adapter-specific
- deployment webhook events create generic agent notifications
- monitoring stays deployment-focused
- this PRD does not redefine repository ownership

## 13. Success Criteria

- an existing Forge application can be deployed through Coolify
- deployment records are stored in Forge
- deployment status is queryable later
- relevant Coolify webhook events update deployment state
- relevant Coolify webhook events create notifications and wake the responsible agent
- the deployment layer stays small and explicit

## 14. Implementation Status

Already available today:
- generic `agent_notifications` storage already exists
- the runtime already supports wake from integration-driven notifications
- GitHub webhook handling already established the pattern of adapter-specific webhook endpoints feeding generic notifications

Still missing:
- application registry
- application-to-repository linkage
- Coolify admin adapter
- deployment records
- deployment tools
- Coolify webhook intake
- deployment status tracking in Forge
