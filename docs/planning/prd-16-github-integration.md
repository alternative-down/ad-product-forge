# PRD-16: GitHub Organization Integration

**Status:** Planned
**Classification:** FORGE APP

## 1. Goal

Connect the company to a GitHub Organization so internal agents can create and operate repositories for company applications.

This PRD is about:
- the company's connection to GitHub
- company applications having repositories
- internal agents requesting repository creation and repository operations through the system

It is not about deployment, monitoring, or arbitrary webhook routing.

## 2. Why This Exists

The company needs a real source-code home for the applications created by internal agents.

Before deployment exists, the system needs to know:
- what an application is
- whether it has a repository
- which GitHub Organization owns that repository
- how the system performs repository operations in the company's name

Without this layer, deployment would have no stable source-of-truth for code.

## 3. Scope

### Included
- connect the company to one GitHub Organization
- store organization/repository metadata in the app
- create repositories for company applications
- retrieve repository details for an application
- allow internal agents to operate company repositories through explicit system operations
- keep repository ownership at the company level, not per-agent

### Excluded
- deployment to infrastructure
- application runtime monitoring
- generic webhook event bus
- arbitrary GitHub query tooling
- advanced Git operations
- organization/team administration
- branch protection automation
- CI/CD workflow management

## 4. Core Concepts

### 4.1 Company GitHub Connection
A single company-level GitHub connection used by the app to operate inside one GitHub Organization.

This is a company integration, not a per-agent identity model.

### 4.2 Company Application
A persistent business/application record inside Forge.

At minimum, an application must have:
- `id`
- `name`
- `description?`
- `createdByAgentId?`
- `createdAt`
- `updatedAt`

### 4.3 Application Repository
A repository linked to one company application.

At minimum, repository metadata should include:
- `applicationId`
- `provider` = `github`
- `organizationName`
- `repositoryName`
- `repositoryUrl`
- `defaultBranch`
- `isPrivate`
- `githubRepositoryId?`
- `createdAt`

## 5. Initial Functional Surface

### 5.1 Connect Company to GitHub Organization
The app stores the company-level GitHub integration configuration.

The first implementation can assume:
- one GitHub Organization
- one authentication strategy for the company

The system should not model one GitHub identity per internal agent.

### 5.2 Create Application
Create a company application record in Forge.

Example output shape:
```ts
{
  applicationId: string;
}
```

### 5.3 Create Application Repository
Create a GitHub repository for one application under the company organization.

Example output shape:
```ts
{
  applicationId: string;
  repositoryName: string;
  repositoryUrl: string;
  defaultBranch: string;
}
```

### 5.4 Get Application Repository
Return repository metadata for one application.

Example output shape:
```ts
{
  applicationId: string;
  repositoryName: string;
  repositoryUrl: string;
  defaultBranch: string;
  organizationName: string;
  isPrivate: boolean;
} | null
```

### 5.5 Basic Repository Operations
The app should expose explicit internal operations for:
- reading repository metadata
- creating branches
- committing changes
- opening pull requests

These should happen through the app in the company context.

They should not start as free-form GitHub tools.

## 6. Authentication Direction

The integration should use one company-level GitHub authentication method.

The important rule is:
- the system acts in the company's GitHub context
- internal agents do not get separate GitHub accounts or identities

The concrete authentication mechanism can be chosen during implementation.

## 7. Data Model Direction

### `applications`
Suggested minimum fields:
- `id`
- `name`
- `description`
- `createdByAgentId`
- `createdAt`
- `updatedAt`

### `application_repositories`
Suggested minimum fields:
- `id`
- `applicationId`
- `provider`
- `organizationName`
- `repositoryName`
- `repositoryUrl`
- `defaultBranch`
- `isPrivate`
- `externalRepositoryId`
- `createdAt`

### `company_integrations`
Suggested minimum fields:
- `id`
- `provider`
- `configuration`
- `createdAt`
- `updatedAt`

The first version can remain GitHub-specific internally if that keeps implementation simpler.

## 8. Design Rules

- repository ownership belongs to the company
- internal agents operate repositories through the app
- application-to-repository linkage must be explicit and persistent
- no per-agent GitHub identities
- no deployment logic in this PRD
- no monitoring logic in this PRD

## 9. Dependency Boundary

This PRD should be completed before the deployment PRD.

Deployment should depend on:
- an existing application record
- an existing linked repository
- repository metadata already known by the app

## 10. Success Criteria

- the company can connect to one GitHub Organization
- the app can create application records
- the app can create repositories for applications
- repository metadata is stored and retrievable
- internal agents can work through explicit company-controlled repository operations
- the deployment system can later consume this repository linkage as a dependency

## 11. Implementation Status

**Status:** Planned

Already available today:
- none of this layer is implemented yet in the app

Still missing:
- company GitHub integration configuration
- application registry
- application repository registry
- repository creation flow
- explicit repository operations through the app
