# PRD-14: Application Deployment

**Status:** Planning
**Feature:** Application Deployment
**Last Updated:** 2026-03-15

---

## 1. Executive Summary

The Application Deployment feature enables agents to automatically deploy applications they create directly to Coolify infrastructure on Hetzner cloud. This capability transforms agents from development tools into full-stack deployment orchestrators, allowing them to take ownership of the entire application lifecycle—from code generation to production availability. Applications deployed through this system are immediately accessible via automatically provisioned URLs and domains, with built-in health monitoring and rollback capabilities.

**Business Value:**
- Enable agents to ship complete, production-ready applications without manual intervention
- Reduce time from application creation to user access
- Automate infrastructure provisioning and configuration management
- Provide agents with deployment monitoring and feedback loops
- Support rapid iteration cycles for agentic development workflows
- Minimize DevOps overhead through intelligent deployment automation

---

## 2. Problem Statement

Currently, agents can create applications (code, configurations, databases) but lack the ability to deploy them to accessible environments. Manual deployment requires:

1. Human intervention to push code, configure infrastructure, and provision resources
2. Manual domain and URL setup, delaying application accessibility
3. No feedback mechanism for agents to verify deployment success
4. Separation of application creation from deployment infrastructure
5. Loss of agentic autonomy and application ownership responsibility
6. Multiple manual steps creating friction and error-prone workflows

This limitation breaks the agent-driven development flow, forcing human operators to complete the deployment pipeline. Agents cannot validate that created applications function in production environments, limiting their ability to iterate and improve their work.

---

## 3. Goals & Success Criteria

### Primary Goals

1. **Autonomous Deployment Capability**
   - Agents can deploy applications directly to Coolify
   - Deployment includes automatic resource provisioning (compute, database, storage)
   - Infrastructure configuration is inferred from application requirements
   - Deployment succeeds or provides actionable error feedback to agent

2. **Immediate Accessibility**
   - All deployed applications receive automatic public URLs
   - Custom domains can be configured by agents
   - SSL/TLS certificates provisioned automatically
   - Applications accessible within 5 minutes of deployment request

3. **Deployment Monitoring & Feedback**
   - Agents receive real-time deployment status updates
   - Health checks verify application is running and responsive
   - Logs are accessible to agents for debugging
   - Rollback capability available if deployment fails

4. **Infrastructure Efficiency**
   - Intelligent resource allocation based on application type and projected usage
   - Cost optimization through right-sizing
   - Automatic scaling configuration for high-traffic applications
   - Resource cleanup for unused or terminated applications

5. **Integration with Coolify & Hetzner**
   - Native Coolify API integration for deployment orchestration
   - Hetzner cloud resource provisioning via Coolify
   - Support for multiple Coolify projects/teams
   - Authentication and credential management

### Success Criteria

- [ ] Agents can deploy Docker-based applications to Coolify within <2 minutes end-to-end
- [ ] 99.5% deployment success rate for valid applications
- [ ] Public URL assigned within 30 seconds of deployment start
- [ ] Health check succeeds within 60 seconds for healthy applications
- [ ] Agents receive deployment status via messages within 5 seconds of milestone events
- [ ] Rollback to previous version completes within 30 seconds
- [ ] Cost per deployment <$0.10 (excluding application resource usage)
- [ ] Support for Node.js, Python, Go, and Docker applications
- [ ] Agents can update deployed applications without full redeployment

---

## 4. Target Users & Use Cases

### Target Users

1. **Agentic Development Workflows** — Agents building and deploying applications as part of autonomous workflows
2. **AI/ML Engineers** — Building and deploying model serving applications
3. **Product Teams** — Rapid prototyping and iteration cycles
4. **Integration Specialists** — Deploying custom integrations and tools
5. **Internal Tool Developers** — Quick deployment of internal utilities

### Key Use Cases

#### 4.1 Autonomous Application Deployment
An internal "application development" agent creates a complete web application with frontend, backend, and database based on requirements. The agent automatically deploys the application to Coolify, receives the public URL, and validates that the application is accessible and functioning correctly. The agent then reports success to the user with the application link.

**Workflow:**
```
Development Agent
  ├─ Generate application code (Node.js + PostgreSQL)
  ├─ Create Dockerfile and docker-compose.yml
  ├─ Call deployApplication() tool with application details
  │  ├─ Coolify creates deployment
  │  ├─ Hetzner resources provisioned
  │  ├─ Application container starts
  │  └─ Health check validates
  ├─ Receive public URL and deployment status
  ├─ Test API endpoints
  ├─ Validate database connectivity
  └─ Report success with application link
```

#### 4.2 Multi-Stage Deployment with Environment Progression
An agent creates and deploys a service through staging→production progression. The agent deploys to staging first, runs automated tests, verifies functionality, then promotes to production without human intervention.

**Workflow:**
```
DevOps Agent
  ├─ Deploy to staging environment
  │  └─ Run integration tests
  ├─ Verify staging deployment health
  ├─ Request approval or auto-promote
  ├─ Deploy same version to production
  ├─ Monitor production health metrics
  └─ Alert on anomalies
```

#### 4.3 Dynamic Service Deployment for Workflows
An internal "workflow coordinator" agent creates microservices on-demand to support multi-agent workflows. Each service is deployed independently and communicates via APIs. Services are cleaned up when workflow completes.

**Workflow:**
```
Workflow Coordinator Agent
  ├─ Create service A (data processor)
  ├─ Deploy service A
  ├─ Create service B (API gateway)
  ├─ Deploy service B
  ├─ Service B discovers Service A via service registry
  ├─ Run workflow using both services
  ├─ Cleanup service A
  ├─ Cleanup service B
  └─ Report workflow completion
```

#### 4.4 Rapid Prototyping with Live Iteration
An agent creates a prototype application, deploys it, gathers feedback through logs and metrics, and iterates by making code changes and redeploying. Each iteration is accessible immediately, enabling rapid feedback cycles.

**Workflow:**
```
Prototype Agent
  ├─ Create initial prototype
  ├─ Deploy version 1 → URL: app-v1.forge.local
  ├─ Monitor usage and errors (5 minutes)
  ├─ Identify issues from logs
  ├─ Update code based on issues
  ├─ Redeploy version 2 → URL: app-v2.forge.local
  ├─ A/B test both versions
  ├─ Analyze metrics
  └─ Promote best version, cleanup other
```

#### 4.5 Custom Integration Tool Deployment
An agent creates a custom integration tool (e.g., webhook processor, data transformer) and deploys it to an accessible endpoint. Other systems can immediately start using the tool via the public URL.

**Workflow:**
```
Integration Agent
  ├─ Create webhook processor service
  ├─ Deploy to Coolify
  ├─ Receive webhook endpoint URL
  ├─ Register webhook with external systems
  └─ Monitor webhook events and processing
```

---

## 5. Feature Overview & Design

### 5.1 Core Concepts

#### Application Artifact
A deployable application package created by agents. Contains:
- **Source code** — application files (Git repo, local files, or generated)
- **Dockerfile** — container image definition
- **Configuration** — environment variables, secrets, resource requirements
- **Services** — API endpoints, workers, scheduled tasks
- **Dependencies** — databases, caches, external services

#### Deployment
A release of an application artifact to a target environment. Characteristics:
- **Deployment ID** — unique identifier (UUID)
- **Application ID** — associated application
- **Environment** — target (staging, production)
- **Version** — application version/tag
- **Status** — pending, building, deploying, running, failed
- **URL** — public URL for running application
- **Health Status** — healthy, degraded, unhealthy, unknown
- **Resources** — CPU, memory, storage allocated
- **Created/Updated** — timestamps

#### Deployment Target (Coolify)
Infrastructure destination for deployment:
- **Coolify Project** — logical grouping in Coolify
- **Hetzner Region** — geographic location (EU, US, etc.)
- **Resource Pool** — compute resources available
- **Network** — isolated network for deployed services
- **Registry** — private Docker registry for images

#### Deployment Pipeline
Execution sequence transforming artifact to running application:
1. **Validation** — verify application structure and config
2. **Build** — compile/build Docker image
3. **Registry Push** — upload image to Coolify's registry
4. **Resource Provisioning** — allocate compute, storage, networking
5. **Deployment** — create containers, configure networking
6. **Health Check** — verify application responsiveness
7. **DNS Registration** — assign public URL and domain
8. **Notification** — inform agent of success/failure

### 5.2 Architecture Overview

```
Agent
  │
  ├─ deployApplication({
  │    applicationId,
  │    artifactPath,
  │    environment: "production",
  │    config: {
  │      resourceAllocation: {...},
  │      domain: "optional-custom-domain",
  │      environment: { ... },
  │      scaling: { ... }
  │    }
  │  })
  │
  └─ Agent Tool: deployApplication()
     │
     ├─ 1. Validation Service
     │  ├─ Verify Dockerfile exists
     │  ├─ Validate configuration schema
     │  ├─ Check resource availability
     │  └─ Validate domain (if custom)
     │
     ├─ 2. Build Pipeline
     │  ├─ Build Docker image locally or via Coolify
     │  ├─ Tag image with version
     │  └─ Push to Coolify Docker registry
     │
     ├─ 3. Coolify Deployment API
     │  ├─ Create deployment definition
     │  ├─ Configure environment variables
     │  ├─ Allocate resources (CPU, RAM, storage)
     │  ├─ Set up networking and routing
     │  └─ Submit to Coolify orchestrator
     │
     ├─ 4. Hetzner Infrastructure
     │  ├─ Provision VMs/containers
     │  ├─ Allocate storage volumes
     │  ├─ Configure networking
     │  └─ Set up load balancing
     │
     ├─ 5. Health Check Service
     │  ├─ Poll application endpoints
     │  ├─ Verify database connectivity
     │  ├─ Check background jobs
     │  └─ Report health status
     │
     ├─ 6. DNS & Networking
     │  ├─ Assign public URL
     │  ├─ Configure custom domain (optional)
     │  ├─ Provision SSL/TLS certificate
     │  └─ Set up ingress routing
     │
     └─ 7. Notification & Storage
        ├─ Store deployment metadata
        ├─ Send status messages to agent
        ├─ Log deployment events
        └─ Return deployment object with URL

Agent receives:
  {
    deploymentId: "dep-xyz",
    applicationId: "app-123",
    status: "running",
    publicUrl: "https://my-app-xyz.coolify.local",
    customDomain: "my-app.example.com",
    healthStatus: "healthy",
    resourcesAllocated: {
      cpu: "1000m",
      memory: "1Gi",
      storage: "20Gi"
    },
    createdAt: "2026-03-15T12:00:00Z",
    readyAt: "2026-03-15T12:02:30Z"
  }
```

### 5.3 Key Design Principles

1. **Zero-Touch Automation** — No human intervention required; entire pipeline runs automatically
2. **Agent-Centric** — Deployment feedback loops back to agents for autonomous iteration
3. **Infrastructure as Code** — All deployment configuration expressed as code/config files
4. **Resilience** — Graceful degradation; partial failures reported rather than blocking
5. **Observability** — Comprehensive logging and metrics for all deployment stages
6. **Security** — Secrets managed via Coolify secret store; no secrets in agent code
7. **Cost Awareness** — Resource allocation based on actual application needs; unused resources cleaned up
8. **Version Control** — Every deployment tied to specific code version; rollback always available

---

## 6. Detailed Requirements

### 6.1 Deployment Tool

**Tool:** `deployApplication()`
**Caller:** Agents
**Location:** `packages/mastra-engine/src/agent/tools/deployment.ts`

**Input:**
```typescript
interface DeployApplicationRequest {
  // Application identification
  applicationId: string;                    // Unique app identifier
  applicationName: string;                  // Human-readable name

  // Source code and artifacts
  artifactPath: string;                     // Path to Dockerfile/code repo
  sourceCode?: {
    repositoryUrl?: string;                 // GitHub/GitLab URL (if applicable)
    branch?: string;                        // Git branch (default: main)
    commit?: string;                        // Specific commit hash
  };

  // Deployment target
  environment: "staging" | "production";    // Target environment
  region?: string;                          // Hetzner region (default: eu-central)

  // Configuration
  config: {
    // Resource allocation
    resourceAllocation?: {
      cpu: string;                          // CPU units: "100m", "500m", "1000m", "2000m"
      memory: string;                       // Memory: "256Mi", "512Mi", "1Gi", "2Gi"
      storage?: string;                     // Storage: "5Gi", "10Gi", "50Gi"
      ephemeralStorage?: string;            // Temp storage for build artifacts
    };

    // Networking
    port?: number;                          // Application port (default: 3000)
    domain?: string;                        // Custom domain (optional, e.g., "app.example.com")
    exposePublicUrl: boolean;               // Create public URL (default: true)

    // Environment variables
    environment?: Record<string, string>;   // Key-value environment variables
    secrets?: Record<string, string>;       // Sensitive values (stored in secret manager)

    // Scaling
    scaling?: {
      minReplicas?: number;                 // Minimum instances (default: 1)
      maxReplicas?: number;                 // Maximum instances
      targetCpuPercent?: number;            // CPU threshold for scaling
    };

    // Health checking
    healthCheck?: {
      path?: string;                        // HTTP endpoint to check (e.g., /health)
      protocol?: "http" | "tcp";            // Protocol (default: http)
      initialDelay?: number;                // Seconds before first check
      interval?: number;                    // Check interval in seconds
      timeout?: number;                     // Timeout per check in seconds
      failureThreshold?: number;            // Failures before marking unhealthy
    };

    // Build configuration
    build?: {
      dockerfile?: string;                  // Dockerfile path (default: Dockerfile)
      buildArgs?: Record<string, string>;   // Build args for docker build
      registry?: string;                    // Custom Docker registry URL
    };

    // Scheduling and policies
    restart?: {
      policy: "no" | "always" | "onFailure"; // Restart policy
      maxRetries?: number;                  // Max restart attempts
    };

    // Databases and services
    services?: Array<{
      name: string;                         // Service identifier
      type: "database" | "cache" | "storage"; // Service type
      engine: string;                       // "postgres", "mysql", "redis", etc.
      version?: string;                     // Service version
      config?: Record<string, unknown>;     // Service-specific config
    }>;
  };
}
```

**Output:**
```typescript
interface DeployApplicationResponse {
  // Deployment identification
  deploymentId: string;                     // Unique deployment ID
  applicationId: string;                    // Associated application
  status: DeploymentStatus;                 // Current status

  // Access information
  publicUrl?: string;                       // Public URL (e.g., app-xyz123.coolify.local)
  customDomain?: string;                    // Custom domain if configured
  ports?: Record<string, number>;           // Exposed ports

  // Resource allocation
  resourcesAllocated: {
    cpu: string;
    memory: string;
    storage?: string;
  };

  // Health and monitoring
  healthStatus: "healthy" | "degraded" | "unhealthy" | "unknown";
  readyReplicas: number;                    // Running replicas
  desiredReplicas: number;                  // Target replicas

  // Metadata
  environment: string;                      // Deployment environment
  version: string;                          // Application version
  createdAt: string;                        // Creation timestamp (ISO 8601)
  readyAt?: string;                         // When first replica became ready

  // Coolify details
  coolifyProjectId?: string;                // Coolify project this belongs to
  coolifyApplicationId?: string;            // Coolify application ID

  // Diagnostics
  events?: Array<{
    timestamp: string;
    type: string;                           // "created", "building", "deployed", "health_check_passed", etc.
    message: string;
    severity: "info" | "warning" | "error";
  }>;
}

type DeploymentStatus =
  | "pending"       // Initial state
  | "validating"    // Checking configuration
  | "building"      // Building Docker image
  | "pushing"       // Uploading image to registry
  | "provisioning"  // Allocating resources
  | "deploying"     // Starting containers
  | "healthChecking" // Running health checks
  | "running"       // Fully operational
  | "failed"        // Deployment failed
  | "updating"      // Updating running deployment
  | "terminating"   // Cleanup in progress
  | "terminated";   // Removed
```

**Behavior:**
1. Validate deployment request (schema, resource limits, configuration)
2. Check Coolify connectivity and authentication
3. Build Docker image (or use provided image)
4. Push image to Coolify's private Docker registry
5. Call Coolify API to create deployment
6. Configure environment variables, secrets, and networking
7. Allocate resources on Hetzner infrastructure
8. Start application containers
9. Run health checks until healthy or timeout
10. Assign public URL and configure custom domain (if provided)
11. Return deployment details with URL to agent
12. Subscribe to deployment events and send updates to agent

**Error Handling:**
- Invalid configuration → return validation error immediately
- Build failure → report build logs to agent, mark as failed
- Resource unavailable → suggest smaller resource config
- Coolify API error → retry with exponential backoff, report to agent
- Health check failure → check logs, attempt restart, report to agent
- Network failure → queue deployment, retry when network restored

### 6.2 Deployment Status & Monitoring

**Tool:** `getDeploymentStatus()`
**Caller:** Agents
**Location:** Exposed as agent tool

**Input:**
```typescript
interface GetDeploymentStatusRequest {
  deploymentId: string;                     // Target deployment
  includeEvents?: boolean;                  // Include event history (default: false)
  includeLogs?: boolean;                    // Include recent logs (default: false)
}
```

**Output:**
```typescript
interface DeploymentStatusResponse {
  deploymentId: string;
  status: DeploymentStatus;
  healthStatus: "healthy" | "degraded" | "unhealthy" | "unknown";
  publicUrl?: string;
  customDomain?: string;
  readyReplicas: number;
  desiredReplicas: number;
  uptime: string;                           // Human-readable uptime
  resourcesUsed?: {
    cpuPercent: number;
    memoryPercent: number;
    storageUsed: string;
  };
  lastUpdated: string;
  events?: Array<{
    timestamp: string;
    type: string;
    message: string;
    severity: string;
  }>;
  logs?: Array<{
    timestamp: string;
    level: "info" | "warning" | "error";
    message: string;
    source: string;                        // Container name
  }>;
}
```

### 6.3 Application Updates & Redeployment

**Tool:** `updateDeployment()`
**Caller:** Agents
**Location:** Exposed as agent tool

**Input:**
```typescript
interface UpdateDeploymentRequest {
  deploymentId: string;                     // Target deployment
  version?: string;                         // New version/tag
  config?: Partial<DeploymentConfig>;       // Config overrides
  sourceCode?: {                            // Optional: new source code
    repositoryUrl?: string;
    branch?: string;
    commit?: string;
  };
}
```

**Behavior:**
1. Validate new configuration
2. Build new image with updated source (if provided)
3. Create new replica with new image
4. Run health checks on new replica
5. If healthy: route traffic to new replica, stop old replica
6. If unhealthy: stop new replica, continue with old
7. Keep old deployment available for rollback for 24 hours

### 6.4 Deployment Cleanup & Termination

**Tool:** `terminateDeployment()`
**Caller:** Agents
**Location:** Exposed as agent tool

**Input:**
```typescript
interface TerminateDeploymentRequest {
  deploymentId: string;
  keepResources?: boolean;                  // Keep resources for manual cleanup
  reason?: string;                          // Termination reason (logged)
}
```

**Behavior:**
1. Mark deployment as "terminating"
2. Gracefully shutdown running containers
3. Disconnect load balancer
4. Cleanup networking and DNS entries
5. Release Hetzner resources
6. Archive deployment metadata for 30 days
7. Clean up Coolify project (if auto-created)

### 6.5 Storage & Persistence

**Schema Additions:**
Location: `packages/mastra-engine/src/agent/deployment/store.ts`

**Table: `forge_deployments`**
```sql
CREATE TABLE forge_deployments (
  deployment_id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',     -- enum: pending, building, running, failed, etc.
  health_status TEXT DEFAULT 'unknown',
  environment TEXT NOT NULL,         -- 'staging', 'production'
  region TEXT NOT NULL,
  public_url TEXT UNIQUE,
  custom_domain TEXT,
  port INTEGER DEFAULT 3000,
  resource_allocation JSON NOT NULL,
  config JSON NOT NULL,              -- Full deployment config
  version TEXT,
  coolify_project_id TEXT,
  coolify_application_id TEXT,
  created_at TEXT NOT NULL,
  ready_at TEXT,
  updated_at TEXT NOT NULL,
  terminated_at TEXT,
  metadata JSON,
  FOREIGN KEY (agent_id) REFERENCES forge_agents(agent_id)
);
```

**Table: `forge_deployment_events`**
```sql
CREATE TABLE forge_deployment_events (
  event_id TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL,
  event_type TEXT NOT NULL,         -- 'created', 'building', 'deployed', 'health_check_passed', etc.
  severity TEXT DEFAULT 'info',     -- 'info', 'warning', 'error'
  message TEXT NOT NULL,
  details JSON,
  created_at TEXT NOT NULL,
  FOREIGN KEY (deployment_id) REFERENCES forge_deployments(deployment_id)
);
```

**Table: `forge_deployment_rollback_history`**
```sql
CREATE TABLE forge_deployment_rollback_history (
  rollback_id TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL,
  from_version TEXT,
  to_version TEXT,
  reason TEXT,
  status TEXT DEFAULT 'pending',     -- 'pending', 'completed', 'failed'
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (deployment_id) REFERENCES forge_deployments(deployment_id)
);
```

### 6.6 Coolify Integration

**API Endpoints Used:**
- `POST /api/v1/projects/{projectId}/applications` — Create application
- `POST /api/v1/applications/{appId}/deployments` — Create deployment
- `GET /api/v1/deployments/{deploymentId}` — Get deployment status
- `POST /api/v1/deployments/{deploymentId}/logs` — Stream logs
- `POST /api/v1/deployments/{deploymentId}/rollback` — Rollback deployment
- `DELETE /api/v1/applications/{appId}` — Delete application

**Authentication:**
- API Token stored in environment: `COOLIFY_API_TOKEN`
- Coolify instance URL in env: `COOLIFY_API_URL`
- All requests use Bearer token authentication

**Configuration:**
```typescript
interface CoolifyConfig {
  apiUrl: string;                           // Coolify instance URL
  apiToken: string;                         // API authentication token
  defaultProjectId: string;                 // Default project for deployments
  defaultRegistry: string;                  // Private Docker registry URL
  hetznerCloudToken?: string;               // Optional: Hetzner API token
  defaultRegion: string;                    // Default Hetzner region
  timeout: number;                          // Request timeout in ms
}
```

### 6.7 Security & Access Control

**Tool Access:**
- Only agents can call deployment tools
- Each agent can only manage their own deployments
- Agent must have `deploy` permission (default: all agents)

**Secrets Management:**
- Environment variables marked as secrets are stored in Coolify's secret manager
- Secrets never logged or exposed in deployment events
- Secrets accessible only within container at runtime
- Agent cannot retrieve secrets after deployment (write-only)

**Network Security:**
- Applications deployed with private networking by default
- Public URLs use managed DNS + automatic SSL/TLS
- Custom domains require DNS CNAME validation
- Network policies restrict inter-deployment communication by default

**Resource Quotas:**
- Per-agent deployment limits (default: 50 concurrent)
- Storage quotas per region
- CPU/memory limits per deployment
- Agents notified when approaching limits

---

## 7. Implementation Plan

### Phase 1: Foundation & Integration (Week 1-2)
- [ ] Set up Coolify API client and connection validation
- [ ] Implement Coolify authentication and credential management
- [ ] Create deployment types and interfaces
- [ ] Implement Dockerfile generation for common app types
- [ ] Add `forge_deployments` database schema
- [ ] Write unit tests for Coolify API wrapper
- [ ] Set up deployment environment configuration

### Phase 2: Core Deployment Tool (Week 2-3)
- [ ] Implement `deployApplication()` tool
- [ ] Implement deployment validation pipeline
- [ ] Implement Docker image building and pushing
- [ ] Implement Coolify deployment API calls
- [ ] Implement health checking and status monitoring
- [ ] Write integration tests for deployment flow
- [ ] Implement deployment event logging

### Phase 3: Monitoring & Management (Week 3-4)
- [ ] Implement `getDeploymentStatus()` tool
- [ ] Implement `updateDeployment()` tool
- [ ] Implement `terminateDeployment()` tool
- [ ] Implement rollback capabilities
- [ ] Add deployment metrics and observability
- [ ] Write end-to-end deployment tests
- [ ] Implement agent notification for deployment events

### Phase 4: Advanced Features & Documentation (Week 4-5)
- [ ] Implement multi-environment support (staging → production promotion)
- [ ] Implement auto-scaling configuration
- [ ] Implement custom domain support with DNS validation
- [ ] Implement deployment cost estimation
- [ ] Write API documentation
- [ ] Create example workflows
- [ ] Performance testing under load
- [ ] Documentation and runbooks

---

## 8. Data Flow & Interactions

### Deployment Creation Flow

```
Agent
  │
  └─ tool call: deployApplication({
       applicationId: "app-123",
       artifactPath: "/tmp/app-code",
       environment: "production",
       config: {
         resourceAllocation: {cpu: "500m", memory: "512Mi"},
         port: 3000,
         healthCheck: {path: "/health"}
       }
     })
     │
     ├─ Validate Configuration
     │  ├─ Check Dockerfile exists
     │  ├─ Validate resource request
     │  ├─ Verify Coolify connectivity
     │  └─ Check agent deployment quota
     │
     ├─ Build Docker Image
     │  ├─ docker build -t app-123:v1 .
     │  └─ Store in local build cache
     │
     ├─ Push to Coolify Registry
     │  ├─ Tag image: coolify-registry/app-123:v1
     │  └─ docker push coolify-registry/app-123:v1
     │
     ├─ Call Coolify API
     │  ├─ POST /api/v1/projects/{projectId}/applications
     │  │  └─ Create application in Coolify
     │  └─ POST /api/v1/applications/{appId}/deployments
     │     ├─ Create deployment spec
     │     ├─ Set resource allocation
     │     ├─ Configure networking
     │     └─ Submit to Coolify orchestrator
     │
     ├─ Hetzner Infrastructure Provisioning
     │  ├─ Allocate compute VM/container
     │  ├─ Allocate storage volume
     │  ├─ Configure networking
     │  └─ Start application container
     │
     ├─ Health Check Loop
     │  ├─ Wait 2 seconds
     │  ├─ GET https://app-xyz.coolify.local/health
     │  ├─ Check response code (200 = success)
     │  ├─ Retry up to 30 times (60 seconds total)
     │  └─ Mark ready when health check passes
     │
     ├─ DNS & Networking Setup
     │  ├─ Assign public URL: app-xyz123.coolify.local
     │  ├─ Provision SSL/TLS certificate (LetsEncrypt)
     │  └─ Configure ingress routing
     │
     ├─ Store Deployment Metadata
     │  ├─ INSERT into forge_deployments
     │  ├─ INSERT deployment events
     │  └─ Generate deployment ID
     │
     └─ Return to Agent
        {
          deploymentId: "dep-xyz",
          status: "running",
          publicUrl: "https://app-xyz123.coolify.local",
          healthStatus: "healthy",
          readyAt: "2026-03-15T12:02:30Z"
        }

Agent
  │
  └─ Receive deployment response
     ├─ Extract public URL
     ├─ Test application access
     ├─ Validate functionality
     └─ Report success to user
```

### Status Update Flow

```
Agent
  │
  └─ tool call: getDeploymentStatus({deploymentId: "dep-xyz"})
     │
     ├─ Query forge_deployments by deployment_id
     ├─ Query recent deployment events
     ├─ Call Coolify API: GET /api/v1/deployments/{depId}
     ├─ Get current replica count and resource usage
     ├─ Fetch recent logs (last 20 lines)
     │
     └─ Return status response
        {
          status: "running",
          healthStatus: "healthy",
          readyReplicas: 1,
          desiredReplicas: 1,
          resourcesUsed: {
            cpuPercent: 25,
            memoryPercent: 40
          },
          events: [
            {timestamp: "...", type: "created", severity: "info"},
            {timestamp: "...", type: "building", severity: "info"},
            {timestamp: "...", type: "deployed", severity: "info"},
            {timestamp: "...", type: "health_check_passed", severity: "info"}
          ]
        }
```

### Update/Redeploy Flow

```
Agent
  │
  └─ tool call: updateDeployment({
       deploymentId: "dep-xyz",
       version: "v2",
       sourceCode: {commit: "abc123"}
     })
     │
     ├─ Fetch existing deployment config
     ├─ Build new Docker image with new code
     ├─ Push new image to registry
     ├─ Create new Coolify deployment
     ├─ Run health checks on new replica
     │  ├─ If healthy:
     │  │  ├─ Switch traffic to new replica
     │  │  ├─ Stop old replica (keep 24h for rollback)
     │  │  └─ Mark as "running" with new version
     │  └─ If unhealthy:
     │     ├─ Stop new replica
     │     ├─ Continue with old replica
     │     └─ Report failure with logs
     │
     └─ Return updated deployment status
```

### Termination Flow

```
Agent
  │
  └─ tool call: terminateDeployment({deploymentId: "dep-xyz"})
     │
     ├─ Update forge_deployments: status = "terminating"
     ├─ Call Coolify API: DELETE /api/v1/applications/{appId}
     │  ├─ Gracefully shutdown containers
     │  ├─ Disconnect load balancer
     │  └─ Release networking
     ├─ Call Hetzner API: Release resources
     │  ├─ Delete VM/container
     │  ├─ Delete storage volumes
     │  └─ Release IP addresses
     ├─ Update DNS: Remove public URL
     ├─ Archive deployment metadata
     ├─ Update forge_deployments: status = "terminated"
     │
     └─ Return confirmation
        {
          deploymentId: "dep-xyz",
          status: "terminated",
          terminatedAt: "2026-03-15T12:10:00Z"
        }
```

---

## 9. API Reference

### deployApplication()

**Type:** Tool (agent function)
**Module:** `packages/mastra-engine/src/agent/tools/deployment.ts`
**Caller:** Agents
**Availability:** All agents via auto-registered tools

```typescript
tool.deployApplication({
  applicationId: "my-app",
  applicationName: "My Web Application",
  artifactPath: "/tmp/my-app",
  environment: "production",
  config: {
    resourceAllocation: {
      cpu: "500m",
      memory: "512Mi",
      storage: "10Gi"
    },
    port: 3000,
    domain: "myapp.example.com",
    environment: {
      DATABASE_URL: "postgres://...",
      API_KEY: "secret-value"
    },
    secrets: {
      JWT_SECRET: "jwt-secret-value"
    },
    healthCheck: {
      path: "/health",
      interval: 10,
      timeout: 5,
      failureThreshold: 3
    }
  }
}): Promise<DeployApplicationResponse>
```

### getDeploymentStatus()

```typescript
tool.getDeploymentStatus({
  deploymentId: "dep-xyz",
  includeEvents: true,
  includeLogs: true
}): Promise<DeploymentStatusResponse>
```

### updateDeployment()

```typescript
tool.updateDeployment({
  deploymentId: "dep-xyz",
  version: "v2",
  sourceCode: {
    commit: "abc123def456"
  },
  config: {
    resourceAllocation: {
      cpu: "1000m",
      memory: "1Gi"
    }
  }
}): Promise<DeployApplicationResponse>
```

### terminateDeployment()

```typescript
tool.terminateDeployment({
  deploymentId: "dep-xyz",
  reason: "Application sunset"
}): Promise<{
  deploymentId: string;
  status: "terminated";
  terminatedAt: string;
  resourcesCleaned: boolean;
}>
```

---

## 10. Configuration & Deployment

### Environment Variables

```bash
# Coolify Configuration
COOLIFY_API_URL=https://coolify.example.com
COOLIFY_API_TOKEN=<api-token>
COOLIFY_DEFAULT_PROJECT_ID=<project-id>
COOLIFY_PRIVATE_REGISTRY=coolify-registry.example.com

# Hetzner Configuration (optional, if not delegating to Coolify)
HETZNER_API_TOKEN=<token>
HETZNER_DEFAULT_REGION=eu-central

# Deployment Defaults
DEPLOYMENT_DEFAULT_CPU=500m
DEPLOYMENT_DEFAULT_MEMORY=512Mi
DEPLOYMENT_DEFAULT_STORAGE=10Gi
DEPLOYMENT_HEALTH_CHECK_TIMEOUT=60
DEPLOYMENT_BUILD_TIMEOUT=300
DEPLOYMENT_CLEANUP_RETENTION_DAYS=30

# Deployment Quotas (per agent)
DEPLOYMENT_MAX_CONCURRENT=50
DEPLOYMENT_MAX_CPU_TOTAL=10000m
DEPLOYMENT_MAX_MEMORY_TOTAL=100Gi
DEPLOYMENT_MAX_STORAGE_TOTAL=500Gi

# Cost Control
DEPLOYMENT_COST_ESTIMATION_ENABLED=true
DEPLOYMENT_COST_BUDGET_DAILY=1000  # USD

# Logging & Observability
DEPLOYMENT_LOG_RETENTION_DAYS=7
DEPLOYMENT_EVENT_RETENTION_DAYS=30
```

### Monitoring & Observability

**Metrics:**
- `deployment_created_total` — counter, labeled by environment, agent_id
- `deployment_successful_total` — counter
- `deployment_failed_total` — counter, labeled by failure_reason
- `deployment_duration_seconds` — histogram, per phase
- `deployment_active_count` — gauge
- `deployment_resource_utilization` — histogram (cpu%, memory%, storage%)
- `deployment_health_check_failures_total` — counter
- `deployment_replicas_ready` — gauge, per deployment
- `deployment_cost_usd` — histogram

**Logs:**
- `[DEPLOYMENT] Created {deploymentId} for agent {agentId}`
- `[DEPLOYMENT] Building image for {applicationId}`
- `[DEPLOYMENT] Pushed image to Coolify registry`
- `[DEPLOYMENT] Deployment {deploymentId} reached status: {status}`
- `[DEPLOYMENT] Health check passed for {deploymentId}`
- `[DEPLOYMENT_ERROR] Deployment {deploymentId} failed: {error}`
- `[DEPLOYMENT] Terminated {deploymentId}`

**Observability:**
- All deployment events stored in `forge_deployment_events` table
- Full event audit trail for compliance
- Real-time status push to agents via communication module
- Health metrics accessible via deployment status queries
- Cost reports available to agents and admins

---

## 11. Testing Strategy

### Unit Tests

**Deployment Validation:**
- ✅ Valid deployment request accepted
- ✅ Invalid configuration rejected with clear errors
- ✅ Resource limits enforced
- ✅ Port ranges validated
- ✅ Domain validation (if custom)
- ✅ Environment variable substitution works
- ✅ Secrets properly masked in logs

**Docker Image Building:**
- ✅ Dockerfile detection (provided vs generated)
- ✅ Build arguments passed correctly
- ✅ Build failures reported with logs
- ✅ Image tagging follows naming convention
- ✅ Build timeout enforced

**Coolify Integration:**
- ✅ API token validation on startup
- ✅ API request/response formatting correct
- ✅ API error responses handled gracefully
- ✅ Retry logic works (exponential backoff)
- ✅ Timeout handling works
- ✅ Authentication failure detected

**Health Checking:**
- ✅ HTTP endpoint polling works
- ✅ Timeout logic works
- ✅ Failure threshold logic works
- ✅ TCP port checking works
- ✅ Unhealthy app detected and reported

### Integration Tests

**Deployment Lifecycle:**
- ✅ Create → Running → Terminate flow works
- ✅ Multiple deployments per agent
- ✅ Multiple agents deploying simultaneously
- ✅ Deployment metadata stored correctly
- ✅ Events logged for all transitions

**Application Access:**
- ✅ Public URL accessible within 5 minutes
- ✅ Custom domain resolves correctly
- ✅ SSL/TLS certificate valid
- ✅ Redirects from HTTP to HTTPS work
- ✅ Application responds to HTTP requests

**Monitoring:**
- ✅ Status endpoint returns current state
- ✅ Event history accurate and complete
- ✅ Metrics recorded correctly
- ✅ Resource usage reported accurately
- ✅ Log streaming works

**Error Handling:**
- ✅ Build failure → deployment fails with logs
- ✅ Resource unavailable → deployment fails with suggestion
- ✅ Health check timeout → deployment fails gracefully
- ✅ Coolify API error → retry and recover
- ✅ Network failure → graceful degradation

### End-to-End Tests

**Scenario: Simple Web Application**
1. Agent creates Node.js web app
2. Agent deploys with `deployApplication()`
3. Deployment reaches "running" status within 2 minutes
4. Public URL accessible and responds to requests
5. Agent calls `getDeploymentStatus()`, receives correct state
6. Agent calls `updateDeployment()` with new code
7. New version deployed without downtime
8. Agent calls `terminateDeployment()`
9. Application no longer accessible
10. Resources released and cleaned up

**Scenario: Multi-Service Deployment**
1. Agent creates database service (PostgreSQL)
2. Agent creates API service (Node.js)
3. API service connects to database service
4. Both services healthy
5. Agent updates API code without restarting database
6. Database continues serving requests
7. Both services terminated

**Scenario: Custom Domain**
1. Agent deploys with custom domain
2. Agent provides DNS CNAME for validation
3. Custom domain resolves to application
4. SSL/TLS certificate provisioned for custom domain
5. Application accessible via custom domain and auto-generated URL

---

## 12. Risks & Mitigation

| Risk | Impact | Mitigation |
| --- | --- | --- |
| **Build Failures** | Deployment never starts, app inaccessible | Provide detailed build logs; offer debugging tips; suggest Dockerfile improvements |
| **Resource Exhaustion** | Deployment fails due to insufficient resources; quota exceeded | Enforce per-agent quotas; provide resource forecasting; auto-suggest right-sizing |
| **Cost Overrun** | Expensive resource allocation; runaway deployments | Cost estimation before deployment; daily budgets; automatic alerts; auto-termination of expensive apps |
| **Security Breach** | Compromised deployed application; secret exposure | Secrets in managed store only; network isolation; audit logs; RBAC |
| **Cascading Failures** | Failed deployment blocks other deployments | Isolate failures per deployment; queue management; parallel deployment capability |
| **Data Loss** | Application termination deletes persistent data | Backup databases before termination; offer snapshots; retention policies |
| **Slow Deployments** | Agents waiting >5 min; poor UX | Parallel build/push/deploy; streaming logs; real-time status; caching |
| **Domain Conflicts** | Multiple agents claim same custom domain | Domain uniqueness validation; ownership verification; reservation system |
| **Coolify Unavailable** | Deployments blocked; service degradation | Fallback to backup Coolify instance; graceful degradation; queue for retry |

---

## 13. Future Enhancements

### Short Term (1-2 Sprints)
- [ ] Deployment templates for common app types (Node.js, Python, Go, Ruby)
- [ ] One-click canary deployments (traffic splitting)
- [ ] Deployment metrics dashboard
- [ ] Rollback via UI and agents
- [ ] Cost reports per deployment and agent
- [ ] Email/Slack notifications for deployment events

### Medium Term (2-3 Sprints)
- [ ] Multi-region deployments with load balancing
- [ ] Blue-green deployments with traffic switching
- [ ] Auto-scaling policy learning from metrics
- [ ] Database backup and restore tooling
- [ ] CDN integration for static assets
- [ ] Integration with CI/CD pipelines (GitHub Actions, GitLab CI)
- [ ] Environment promotion workflows (dev → staging → prod)
- [ ] Deployment approval policies for production

### Long Term (3+ Sprints)
- [ ] Multi-cloud deployment (AWS, GCP, Azure in addition to Hetzner)
- [ ] Kubernetes cluster management and orchestration
- [ ] Service mesh integration (Istio for advanced traffic management)
- [ ] Disaster recovery and failover automation
- [ ] Cost optimization recommendations (resource rightsizing, reserved capacity)
- [ ] GitOps integration (Flux, ArgoCD)
- [ ] GraphQL API for deployment management
- [ ] Web UI for deployment visualization and management
- [ ] Deployment policy engine (compliance, security gates)
- [ ] Integration with observability platforms (Datadog, New Relic, Prometheus)

---

## Appendix A: Example: Simple Web Application Deployment

```typescript
// Agent deploying a Node.js web application
const agent = await createAgent({
  id: 'dev-agent-001',
  instructions: 'You are a developer agent that creates and deploys applications...',
  model: 'claude-opus',
});

// 1. Create application
const appCode = `
// app.js
const express = require('express');
const app = express();
app.get('/health', (req, res) => res.json({status: 'ok'}));
app.get('/api/hello', (req, res) => res.json({message: 'Hello World'}));
app.listen(3000);
`;

// 2. Deploy application
const deploymentResponse = await agent.tool('deployApplication', {
  applicationId: 'hello-world-app',
  applicationName: 'Hello World App',
  artifactPath: '/tmp/hello-world',
  environment: 'production',
  config: {
    resourceAllocation: {
      cpu: '250m',
      memory: '256Mi',
      storage: '5Gi'
    },
    port: 3000,
    domain: 'hello-app.example.com',
    environment: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info'
    },
    healthCheck: {
      path: '/health',
      interval: 10,
      timeout: 5,
      failureThreshold: 3
    }
  }
});

console.log('Application deployed!');
console.log('Public URL:', deploymentResponse.publicUrl);
console.log('Custom domain:', deploymentResponse.customDomain);
console.log('Status:', deploymentResponse.status);
console.log('Health:', deploymentResponse.healthStatus);

// 3. Verify deployment
const statusResponse = await agent.tool('getDeploymentStatus', {
  deploymentId: deploymentResponse.deploymentId,
  includeEvents: true
});

console.log('Current Status:', statusResponse.status);
console.log('Ready Replicas:', statusResponse.readyReplicas);
console.log('Events:', statusResponse.events.map(e => `${e.type}: ${e.message}`));

// 4. Test application
const fetch = require('node-fetch');
const appUrl = deploymentResponse.publicUrl;
const response = await fetch(`${appUrl}/api/hello`);
const data = await response.json();
console.log('API Response:', data); // {message: 'Hello World'}

// 5. Report to user
console.log(`Application deployed and accessible at ${deploymentResponse.publicUrl}`);
```

---

## Appendix B: Example: Multi-Service Deployment

```typescript
// Agent deploying a full-stack application with database
const agent = await createAgent({
  id: 'fullstack-agent',
  instructions: 'You are a full-stack application developer...',
  model: 'claude-opus',
});

// 1. Deploy PostgreSQL database service
const dbDeployment = await agent.tool('deployApplication', {
  applicationId: 'myapp-db',
  applicationName: 'MyApp Database',
  artifactPath: '/tmp/postgres',
  environment: 'production',
  config: {
    resourceAllocation: {
      cpu: '500m',
      memory: '1Gi',
      storage: '50Gi'
    },
    services: [
      {
        name: 'postgres',
        type: 'database',
        engine: 'postgres',
        version: '15',
        config: {
          POSTGRES_DB: 'myapp',
          POSTGRES_USER: 'admin'
        }
      }
    ]
  }
});

// 2. Deploy API service
const apiDeployment = await agent.tool('deployApplication', {
  applicationId: 'myapp-api',
  applicationName: 'MyApp API',
  artifactPath: '/tmp/api',
  environment: 'production',
  config: {
    resourceAllocation: {
      cpu: '1000m',
      memory: '1Gi',
      storage: '10Gi'
    },
    port: 3000,
    environment: {
      DATABASE_URL: `postgres://admin@${dbDeployment.publicUrl}/myapp`,
      API_PORT: '3000'
    },
    healthCheck: {
      path: '/health',
      interval: 10
    }
  }
});

// 3. Deploy frontend service
const frontendDeployment = await agent.tool('deployApplication', {
  applicationId: 'myapp-web',
  applicationName: 'MyApp Web',
  artifactPath: '/tmp/web',
  environment: 'production',
  config: {
    resourceAllocation: {
      cpu: '250m',
      memory: '512Mi',
      storage: '5Gi'
    },
    port: 3000,
    domain: 'myapp.example.com',
    environment: {
      REACT_APP_API_URL: apiDeployment.publicUrl
    }
  }
});

// 4. Monitor all services
const allServices = [
  {name: 'Database', id: dbDeployment.deploymentId},
  {name: 'API', id: apiDeployment.deploymentId},
  {name: 'Frontend', id: frontendDeployment.deploymentId}
];

for (const service of allServices) {
  const status = await agent.tool('getDeploymentStatus', {
    deploymentId: service.id
  });
  console.log(`${service.name}: ${status.status} (${status.healthStatus})`);
}

console.log('Full-stack application deployed!');
console.log(`Access at: ${frontendDeployment.customDomain}`);
```

---

## Appendix C: Example: Progressive Deployment Strategy

```typescript
// Agent implementing staging → production progression
const deploymentAgent = await createAgent({
  id: 'cd-agent',
  instructions: 'You are a continuous deployment agent...',
  model: 'claude-opus',
});

// 1. Deploy to staging
console.log('Deploying to staging...');
const stagingDep = await deploymentAgent.tool('deployApplication', {
  applicationId: 'myapp',
  applicationName: 'MyApp',
  artifactPath: '/tmp/myapp',
  environment: 'staging',
  config: {
    resourceAllocation: { cpu: '500m', memory: '512Mi' },
    port: 3000
  }
});

console.log(`Staging URL: ${stagingDep.publicUrl}`);

// 2. Run integration tests against staging
const testResult = await runIntegrationTests(stagingDep.publicUrl);
if (!testResult.passed) {
  console.log('Tests failed!', testResult.errors);
  return;
}
console.log('Staging tests passed!');

// 3. Deploy to production
console.log('Deploying to production...');
const prodDep = await deploymentAgent.tool('deployApplication', {
  applicationId: 'myapp',
  applicationName: 'MyApp',
  artifactPath: '/tmp/myapp',
  environment: 'production',
  config: {
    resourceAllocation: { cpu: '1000m', memory: '1Gi' },
    port: 3000,
    domain: 'myapp.example.com',
    scaling: { minReplicas: 2, maxReplicas: 10 }
  }
});

console.log(`Production URL: ${prodDep.publicUrl}`);

// 4. Monitor production health
setInterval(async () => {
  const status = await deploymentAgent.tool('getDeploymentStatus', {
    deploymentId: prodDep.deploymentId
  });

  if (status.healthStatus !== 'healthy') {
    console.log('Production health degraded!', status);
    // Trigger rollback
    await deploymentAgent.tool('terminateDeployment', {
      deploymentId: prodDep.deploymentId,
      reason: 'Health check failed'
    });
    // Redeploy previous version
  }
}, 60000);

console.log('Deployment complete and monitoring active!');
```

---

**Document Version:** 1.0
**Last Review:** 2026-03-15
**Next Review:** 2026-04-15
