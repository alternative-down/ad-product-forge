# PRD-05: Company Application Deployment

**Status:** Planned
**Classification:** FORGE APP

## 1. Goal

Deploy company applications to the company's infrastructure after those applications already exist in Forge and already have a linked source repository.

This PRD is about:
- deployment records
- deployment execution
- deployment status
- deployment monitoring
- deployment cleanup

It is not about creating repositories or defining application ownership.

## 2. Dependency

This PRD depends on the GitHub/application layer being in place first.

A deployment must start from:
- an existing application record
- an existing linked repository
- known repository metadata inside the app

Deployment should not accept raw ad-hoc repository input as its source of truth.

## 3. Scope

### Included
- deploy one company application
- store deployment records in the app
- track deployment status
- receive deployment status updates
- expose deployment status for internal agents
- remove or deactivate deployed applications

### Excluded
- repository creation
- source-code authoring workflows
- organization/repository ownership rules
- billing and customer-facing hosting plans
- advanced infra orchestration across many providers

## 4. Core Concepts

### 4.1 Company Application
A persistent application record owned by the company.

### 4.2 Deployment Target
The infrastructure target where the application is deployed.

The first version can support one target only.

### 4.3 Deployment Record
A persistent deployment record stored in Forge.

This represents one deployment attempt or active deployment for a company application.

## 5. Initial Functional Surface

### 5.1 Create Deployment
Deploy one existing company application.

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

### 5.2 Get Deployment Status
Return one deployment with its current status.

Example output shape:
```ts
{
  deploymentId: string;
  applicationId: string;
  status: 'queued' | 'building' | 'deploying' | 'running' | 'failed';
  url?: string;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}
```

### 5.3 List Application Deployments
Return deployments for one application.

### 5.4 Remove Deployment
Stop or remove a deployed application from the target and update the deployment record.

## 6. URL and Domain Direction

The deployment layer may generate one company-owned URL/subdomain per deployed application.

This should be derived from the application record and the deployment target.

The first version can stay simple:
- one generated subdomain
- one deployment target
- one final application URL

## 7. Monitoring Direction

Monitoring in this PRD should stay deployment-focused.

That means:
- current deployment status
- last deployment error
- deployment URL
- timestamps

It should not try to become a full application observability platform in the first version.

## 8. Data Model Direction

### `application_deployments`
Suggested minimum fields:
- `id`
- `applicationId`
- `requestedByAgentId`
- `status`
- `targetProvider`
- `targetResourceId`
- `branch`
- `commitSha`
- `url`
- `errorMessage`
- `createdAt`
- `updatedAt`
- `completedAt`

### `deployment_targets` (optional)
If needed later, deployment target configuration can be separated.

The first version can remain simple if there is only one target.

## 9. Webhook / Status Update Direction

If the deployment platform can push status updates, the app should accept them and update the deployment record.

This should only update deployment state.

It should not be treated as a general-purpose event-routing system in this PRD.

## 10. Design Rules

- deployment starts from an application, not from raw repo input
- deployment state is persisted in the app
- deployment status is explicit and queryable
- monitoring stays small and deployment-focused
- deployment should not redefine application/repository ownership

## 11. Success Criteria

- an existing company application can be deployed
- deployment records are stored in Forge
- deployment status can be queried later
- deployment errors are persisted clearly
- deployed application URL is available when successful
- deployment logic sits cleanly on top of the GitHub/application layer

## 12. Implementation Status

**Status:** Planned

Already available today:
- none of the deployment layer is implemented yet

Still missing:
- application registry
- repository linkage from the GitHub integration layer
- deployment records
- deployment execution flow
- deployment status tracking
- deployment monitoring surface
