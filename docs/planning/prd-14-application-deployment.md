# PRD-14: Application Deployment

**Status:** Planning

**Note:** This is a personal project from a solo developer. Built with KISS (Keep It Simple, Stupid) and YAGNI (You Aren't Gonna Need It) principles in mind.

---

## 1. Overview

Enable agents to deploy applications to Coolify (self-hosted on Hetzner). Applications get a unique subdomain URL automatically.

**Core flow:**
1. Agent generates application code
2. Agent deploys to Coolify via API
3. Coolify builds and starts application
4. Application accessible via auto-generated subdomain

---

## 2. Use Cases

### 2.1 Deploy Web Application
Agent creates Node.js/Python/static web app → deploys to Coolify → accessible at `https://agent-{name}.domain.com`

### 2.2 Deploy with Database
Agent generates app + database config → Coolify provisions database → app connects automatically

### 2.3 Monitor Deployment
Agent checks deployment status, logs, health checks via tools

---

## 3. Core Tools

**Deployment:**
- `deployApplication(config)` — Deploy app to Coolify
  - Input: app name, git repo, dockerfile/compose file
  - Output: deployment ID, URL, status
- `getDeploymentStatus(deploymentId)` — Check deployment progress
- `getApplicationLogs(deploymentId)` — Retrieve application logs
- `deleteApplication(deploymentId)` — Stop and remove app

**Database:**
- `provisionDatabase(type, name)` — Create PostgreSQL/MySQL database
- `getDatabaseConfig(databaseId)` — Get connection string

---

## 4. Integration with Domain Management

When application deploys:
1. Create unique subdomain via domain management system
2. Point to Coolify instance IP
3. Return FQDN to agent
4. SSL certificate (wildcard) covers subdomain

---

## 5. Storage

- `deployments` — deployment_id, agent_id, app_name, repo_url, status, subdomain, coolify_app_id, deployed_at
- `databases` — database_id, agent_id, type, name, connection_string (encrypted), created_at

---

## 6. Deployment States

- `queued` — Waiting to build
- `building` — Docker image building
- `deploying` — Pushing to Coolify
- `running` — Application started
- `failed` — Deployment failed
- `stopped` — Application stopped

---

## 7. Error Handling

**Build Failures:**
- Retrieve build logs
- Return error to agent
- Agent can fix code and redeploy

**Health Check Failures:**
- App started but not responding
- Log error, mark as degraded
- Agent can check logs and redeploy

**Persistent Failures:**
- After 3 retries, mark as failed
- Don't auto-restart
- Agent takes manual action

---

## 8. Implementation

- **Week 1:** Coolify API client + deployment operations
- **Week 2:** Database provisioning + integration with domain management
- **Week 3:** Status monitoring, logs, error handling, tests

---

## 9. Out of Scope

- Multiple deployment targets (only Coolify)
- Load balancing / auto-scaling
- Advanced CI/CD pipelines
- Environment management beyond dev/prod
- Secrets management UI
- Analytics/monitoring dashboard
- Backup/restore automation
- Service mesh / advanced networking
- GPU support
- Cost estimation

---

**Document Version:** 0.1 (Simplified)
**Last Updated:** 2026-03-15
