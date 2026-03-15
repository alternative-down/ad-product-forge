# PRD-15: Domain Management

**Status:** Planning
**Feature:** Domain Management
**Last Updated:** 2026-03-15

---

## 1. Executive Summary

The Domain Management system provides centralized configuration and automation of domain and DNS settings for deployed agent applications. It enables wildcard domain configuration pointing to Hertzner infrastructure, automatic subdomain provisioning for each deployed agent application, and centralized management of domain DNS records. This system eliminates manual DNS configuration, reduces deployment time, and enables seamless subdomain allocation for multi-agent deployments.

**Business Value:**
- Enable automatic subdomain creation for each deployed agent application
- Reduce manual DNS configuration overhead
- Support scalable multi-agent deployments with unique domain identities
- Centralize domain lifecycle management (creation, validation, renewal)
- Improve security through automated certificate provisioning
- Reduce operational complexity and human error in DNS management

---

## 2. Problem Statement

Current domain and DNS infrastructure has significant limitations:

1. **Manual Subdomain Assignment** — Each agent application requires manual DNS record creation and validation
2. **Provider Limitations** — Current .br domain registrar lacks advanced DNS configuration capabilities (wildcard records, dynamic updates, API automation)
3. **No Automation** — Subdomain provisioning is manual and error-prone, creating bottlenecks during agent deployments
4. **Infrastructure Coupling** — DNS records not aligned with Hertzner machine IP, requiring manual updates when infrastructure changes
5. **Certificate Management** — SSL/TLS certificates require manual provisioning and renewal per subdomain
6. **Scalability Issues** — Manual processes prevent scaling to hundreds of deployed agent applications

This limitation restricts deployment velocity, increases operational burden, and prevents elastic scaling of agent applications.

---

## 3. Goals & Success Criteria

### Primary Goals

1. **Wildcard Domain Configuration**
   - Configure wildcard DNS record (*.domain.com) pointing to Hertzner infrastructure
   - Migrate domain registrar to provider supporting advanced DNS features
   - Establish DNS as single source of truth for agent application routing

2. **Automated Subdomain Provisioning**
   - Dynamically create subdomains for each deployed agent application
   - Provision without manual intervention
   - Associate subdomain with application metadata and routing rules

3. **Infrastructure Automation**
   - Integrate with Hertzner API for IP management
   - Detect infrastructure changes and auto-update DNS records
   - Provision SSL/TLS certificates automatically via Let's Encrypt

4. **DNS Record Management**
   - Create A, CNAME, TXT, MX records as needed
   - Query DNS status and validate configuration
   - Support DNS rollback and history tracking

5. **Multi-Domain Support**
   - Support multiple domain registrations (primary + aliases)
   - Route different application classes to different domains
   - Maintain DNS consistency across all configured domains

### Success Criteria

- [ ] Wildcard domain configuration active and verified
- [ ] Subdomain provisioning latency <5 seconds average
- [ ] >99% uptime for DNS resolution
- [ ] Zero manual DNS operations per new agent deployment
- [ ] SSL/TLS certificate provisioning <1 minute
- [ ] DNS query response time <200ms P95
- [ ] Support >500 concurrent active subdomains
- [ ] Domain migration completed with zero service interruption

---

## 4. Target Users & Use Cases

### Target Users

1. **DevOps/Infrastructure Team** — Managing domain and DNS infrastructure
2. **Deployment Pipeline** — Automated agent deployment system
3. **Operations Team** — Monitoring domain health and DNS status
4. **System Administrator** — Configuring domain policies and DNS rules

### Key Use Cases

#### 4.1 New Agent Deployment with Auto-Subdomain
A new agent application is deployed. The deployment pipeline automatically:
1. Generates unique subdomain (e.g., agent-sales-01.domain.com)
2. Creates DNS A record pointing to Hertzner IP
3. Provisions SSL certificate for subdomain
4. Validates DNS propagation
5. Routes traffic to application instance
6. Marks agent as accessible

**Workflow:**
```
Deployment Pipeline
  ├─ Deploy Agent Application
  ├─ Request Domain: createSubdomain({
  │    agentId: "agent-sales-01",
  │    environment: "production",
  │    hertznerIp: "203.0.113.45"
  │  })
  ├─ Create DNS A Record: agent-sales-01.domain.com → 203.0.113.45
  ├─ Provision SSL: *.domain.com wildcard covers new subdomain
  ├─ Validate DNS Propagation
  └─ Agent accessible at: https://agent-sales-01.domain.com
```

#### 4.2 Domain Migration from Current Registrar
Migrate domain from current .br registrar to advanced DNS provider (Cloudflare, Route53, or similar):
1. Register domain at new provider
2. Set up wildcard DNS record
3. Update nameservers at old registrar
4. Validate DNS propagation across regions
5. Decommission old DNS records
6. Verify all agent subdomains resolve

**Workflow:**
```
Domain Migration
  ├─ New Provider Setup: Configure wildcard *.domain.com
  ├─ Nameserver Update: Update at old registrar
  ├─ Propagation Wait: Monitor DNS propagation (24-48 hours)
  ├─ Validation: Verify all 500+ agent subdomains resolve correctly
  ├─ Old Registrar Cleanup: Remove delegated records
  └─ Migration Complete: Full automation enabled
```

#### 4.3 Infrastructure IP Change (Hertzner Update)
Hertzner server IP changes due to maintenance or scaling:
1. Detect IP change via Hertzner API polling
2. Update all wildcard and explicit DNS records
3. Validate DNS propagation
4. Monitor agent connectivity
5. Alert operations team
6. Auto-rollback if validation fails

**Workflow:**
```
Infrastructure IP Change
  ├─ IP Change Detected: Old: 203.0.113.45 → New: 203.0.113.100
  ├─ DNS Update: All A records point to new IP
  ├─ Propagation Monitor: Wait for global DNS sync
  ├─ Health Check: Verify agent connectivity at new IP
  ├─ Rollback Ready: If health check fails, revert to old IP
  └─ Alert Operations: Notify of IP change + status
```

#### 4.4 Subdomain Lifecycle: Creation to Decommission
Track full lifecycle of subdomain from agent deployment to decommission:
1. Create subdomain on agent deployment
2. Provision SSL certificate
3. Monitor DNS health and certificate expiration
4. Renew certificate 30 days before expiration
5. On agent termination, decommission subdomain
6. Archive DNS records for audit trail

**Workflow:**
```
Subdomain Lifecycle
  ├─ Created: agent-temp-research.domain.com
  │  ├─ DNS A Record: created + propagated
  │  ├─ SSL Certificate: provisioned (wildcard)
  │  └─ Status: active
  │
  ├─ Active Phase (months 1-11)
  │  ├─ Monthly Health Check: DNS, SSL validity, connectivity
  │  └─ Certificate Monitoring: Expiry at day 354
  │
  ├─ Renewal Phase (month 12)
  │  ├─ 30 days before: Renew SSL certificate
  │  ├─ Renew confirmation logged
  │  └─ New certificate deployed to TLS terminator
  │
  └─ Termination: Agent no longer needed
     ├─ DNS Record: marked for deletion (30-day grace)
     ├─ TLS Certificate: revoked or allowed to expire
     ├─ Archive: DNS records + metadata stored
     └─ Status: decommissioned
```

#### 4.5 DNS Health Monitoring & Alerting
Continuous monitoring of domain and DNS infrastructure health:
1. Periodic DNS resolution checks from multiple regions
2. SSL certificate validity monitoring
3. Hertzner IP reachability checks
4. Alert on anomalies or degradation
5. Provide dashboard view of DNS infrastructure status

**Workflow:**
```
DNS Health Monitoring
  ├─ Periodic Checks (every 5 min)
  │  ├─ Global DNS Resolution: Test from 5+ regions
  │  ├─ Certificate Validity: Check expiry dates
  │  ├─ IP Reachability: TCP connectivity to Hertzner IP
  │  └─ Response Time: Measure latency
  │
  ├─ Alert Triggers
  │  ├─ DNS Resolution Failure: Alert severity HIGH
  │  ├─ Certificate Expiry <7 days: Alert severity MEDIUM
  │  └─ High Latency >500ms: Alert severity LOW
  │
  └─ Dashboard
     ├─ Overall Health Status: Green/Yellow/Red
     ├─ Active Subdomains: Count + list
     ├─ Certificate Expiries: Timeline view
     └─ Incident History: Last 30 days
```

---

## 5. Feature Overview & Design

### 5.1 Core Concepts

#### Wildcard Domain
A single domain registration (e.g., domain.com) with wildcard DNS record (*.domain.com) pointing to Hertzner infrastructure. All subdomains automatically resolve to the wildcard target without individual DNS records.

#### Subdomain
A unique DNS name for an agent application (e.g., agent-sales-01.domain.com). Created automatically on deployment, can be customized during agent provisioning.

#### DNS Record
Individual DNS entry (A, CNAME, TXT, MX, etc.) in the domain's DNS zone. Managed through DNS provider API.

#### DNS Provider
Third-party DNS hosting service (Cloudflare, Route53, etc.) supporting:
- API-based record management
- Wildcard records
- Automated certificate provisioning
- Global DNS propagation
- High availability and redundancy

#### DNS Zone
Collection of all DNS records for a domain, managed by the DNS provider.

### 5.2 Architecture Overview

```
Deployment Pipeline
  │
  ├─ Deploy Agent Application
  │
  └─ Domain Management System
      │
      ├─ Subdomain Provisioning
      │  ├─ Generate unique subdomain name
      │  ├─ Create DNS A record via Provider API
      │  ├─ Validate DNS propagation
      │  └─ Return FQDN to deployment
      │
      ├─ SSL/TLS Management
      │  ├─ Wildcard certificate (*.domain.com)
      │  ├─ Auto-renewal 30 days before expiry
      │  ├─ Deploy to TLS terminator
      │  └─ Monitor validity
      │
      ├─ DNS Infrastructure
      │  ├─ Primary DNS Provider: Cloudflare/Route53
      │  ├─ Wildcard Record: *.domain.com → Hertzner IP
      │  ├─ Health Monitoring: Global DNS checks
      │  └─ Backup/Failover: Secondary DNS (optional)
      │
      ├─ Hertzner Integration
      │  ├─ Poll Hertzner API for IP changes
      │  ├─ Update DNS records on IP change
      │  ├─ Monitor server health
      │  └─ Handle failover scenarios
      │
      └─ Domain Registry
          ├─ Primary Domain: domain.com
          ├─ Alias Domains: alt-domain.com (optional)
          ├─ Domain Renewal: Auto-renew 30 days before expiry
          └─ WHOIS Privacy: Managed at registrar
```

### 5.3 Key Design Principles

1. **Automation First** — Minimize manual operations; automate subdomain and certificate provisioning
2. **Zero-Touch Deployment** — Deployment pipeline gets subdomain without explicit domain requests
3. **Single Source of Truth** — DNS provider is authoritative; local cache is read-only
4. **Fault Tolerance** — Handle DNS propagation delays, provider API failures, infrastructure changes gracefully
5. **Auditability** — All domain operations logged with timestamps and actors
6. **Cost Efficiency** — Use wildcard records and centralized certificate to minimize API calls and cert costs
7. **High Availability** — DNS infrastructure resilient to regional outages and provider issues

---

## 6. Detailed Requirements

### 6.1 Domain Registration & Configuration

**Location:** `packages/mastra-engine/src/domain/domain-config.ts`

#### Primary Domain Setup
```typescript
interface DomainConfig {
  primaryDomain: string;           // e.g., "domain.com"
  aliasdomains?: string[];         // e.g., ["alt-domain.com"]
  dnsProvider: "cloudflare" | "route53" | "other";
  providerApiKey: string;          // Encrypted in secrets
  providerApiSecret?: string;      // Encrypted in secrets
  hertznerIp: string;              // Current Hertzner IP
  hertznerServerId: string;        // Hertzner server ID
  wildcardRecordId?: string;       // Provider's record ID
  certificateProvider: "letsencrypt" | "acme";
  tlsTerminatorUrl: string;        // Where to deploy certs
  autoRenewalDays: number;         // Default: 30
}
```

**Configuration Steps:**
1. Register domain at provider with API access enabled
2. Create wildcard DNS record (*.domain.com) → Hertzner IP
3. Verify nameservers updated at domain registrar
4. Generate API credentials at DNS provider
5. Store config in secure environment or database
6. Validate initial DNS resolution

### 6.2 Subdomain Provisioning

**Tool:** `createSubdomain()`
**Location:** `packages/mastra-engine/src/domain/tools/subdomain.ts`

**Input:**
```typescript
interface CreateSubdomainRequest {
  agentId: string;                 // Unique agent identifier
  environment: "development" | "staging" | "production";
  customName?: string;             // Optional custom subdomain name
  metadata?: Record<string, unknown>; // Tags, labels, etc.
}
```

**Output:**
```typescript
interface CreateSubdomainResponse {
  fqdn: string;                    // Fully qualified domain name
  subdomain: string;               // e.g., "agent-sales-01"
  agentId: string;                 // Echo of agentId
  dnsRecordId: string;             // Provider's record ID
  certificateId: string;           // Certificate reference
  status: "creating" | "active" | "failed";
  createdAt: string;               // ISO 8601 timestamp
  expiresAt?: string;              // Certificate expiry
}
```

**Behavior:**
1. Generate unique subdomain name (if not customName)
   - Format: `agent-{agentId}-{random}` or `{customName}`
   - Validate uniqueness in DNS provider
2. Create DNS A record via provider API
   - Domain: subdomain.domain.com
   - Target: Hertzner IP
   - TTL: 300 seconds (auto-updates on IP change)
3. Wait for DNS propagation (global check)
4. Provision SSL certificate (wildcard covers all subdomains)
5. Store mapping: agentId → subdomain + metadata
6. Return FQDN + certificate details
7. Handle errors:
   - DNS provider API failure → retry with exponential backoff
   - Duplicate name → generate new name, retry
   - Propagation timeout → return "creating" status, async complete

### 6.3 DNS Record Management

**Tool:** `updateDnsRecord()`
**Location:** `packages/mastra-engine/src/domain/tools/dns-records.ts`

**Input:**
```typescript
interface UpdateDnsRecordRequest {
  recordId: string;                // DNS record ID from provider
  target: string;                  // New IP or target value
  ttl?: number;                    // Time to live (default: 300)
  force?: boolean;                 // Force update without validation
}
```

**Output:**
```typescript
interface UpdateDnsRecordResponse {
  recordId: string;
  updatedAt: string;
  propagationStatus: "pending" | "propagated" | "failed";
  propagationEta?: number;         // Seconds until global propagation
  validationResult?: {
    queriedRegions: string[];
    allResolved: boolean;
    unresolvedRegions?: string[];
  };
}
```

**Query Tool:** `getDnsStatus()`
```typescript
interface GetDnsStatusRequest {
  subdomain: string;               // e.g., "agent-sales-01"
  checkGlobal?: boolean;           // Check from multiple regions
}

interface GetDnsStatusResponse {
  subdomain: string;
  fqdn: string;
  resolvedIp: string;
  status: "active" | "propagating" | "failed";
  queryResults?: {
    region: string;
    resolvedIp: string;
    latency: number;
    status: "resolved" | "timeout" | "error";
  }[];
  lastChecked: string;
}
```

### 6.4 SSL/TLS Certificate Management

**Tool:** `provisionCertificate()`
**Location:** `packages/mastra-engine/src/domain/tools/certificates.ts`

**Input:**
```typescript
interface ProvisionCertificateRequest {
  domain: string;                  // e.g., "*.domain.com"
  agentSubdomains?: string[];      // List of subdomains to include
  autoRenew?: boolean;             // Default: true
}
```

**Output:**
```typescript
interface ProvisionCertificateResponse {
  certificateId: string;
  domain: string;
  issuedAt: string;
  expiresAt: string;
  issuer: string;                  // "Let's Encrypt" etc.
  status: "active" | "pending" | "error";
  publicKey?: string;              // Cert content (if requested)
}
```

**Certificate Lifecycle:**
1. Request wildcard certificate for *.domain.com
2. Let's Encrypt validation via DNS challenge (TXT record)
3. Certificate provisioned within 2 minutes
4. Deploy to TLS terminator (reverse proxy)
5. Monitor expiry (alert at 30, 14, 7, 1 days)
6. Auto-renew 30 days before expiry
7. New certificate deployed to TLS terminator
8. Old certificate revoked or allowed to expire

### 6.5 Hertzner Infrastructure Integration

**Module:** `packages/mastra-engine/src/domain/hertzner-integration.ts`

**Polling Service:**
```typescript
interface HertznerPollingConfig {
  serverId: string;                // Hertzner server ID
  pollIntervalMinutes: number;     // Default: 5
  apiToken: string;                // Encrypted
}
```

**Behavior:**
1. Poll Hertzner API every 5 minutes
2. Fetch current IP assigned to server
3. Compare with stored hertznerIp
4. If changed:
   - Update all wildcard and A records via DNS provider
   - Validate DNS propagation
   - Update stored IP
   - Log change to audit trail
   - Alert operations team
5. Monitor server status:
   - If server down → alert severity HIGH
   - If server unhealthy → alert severity MEDIUM

### 6.6 Storage & Persistence

**Location:** `packages/mastra-engine/src/domain/store.ts`

#### Domain Configuration Table
```sql
CREATE TABLE forge_domain_config (
  domain_id TEXT PRIMARY KEY,
  primary_domain TEXT NOT NULL UNIQUE,
  alias_domains TEXT[],                    -- JSON array
  dns_provider TEXT NOT NULL,              -- 'cloudflare', 'route53'
  hertzner_server_id TEXT NOT NULL,
  current_hertzner_ip TEXT NOT NULL,
  certificate_provider TEXT,
  tls_terminator_url TEXT,
  auto_renewal_days INTEGER DEFAULT 30,
  config_data JSON,                        -- Encrypted provider credentials
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

#### Subdomain Registry Table
```sql
CREATE TABLE forge_subdomains (
  subdomain_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL UNIQUE,
  subdomain TEXT NOT NULL,                 -- e.g., "agent-sales-01"
  fqdn TEXT NOT NULL UNIQUE,               -- e.g., "agent-sales-01.domain.com"
  environment TEXT,                        -- 'development', 'staging', 'production'
  dns_record_id TEXT,                      -- Provider's record ID
  status TEXT DEFAULT 'active',            -- 'creating', 'active', 'inactive', 'failed'
  certificate_id TEXT,
  certificate_expires_at TEXT,
  metadata JSON,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  decommissioned_at TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);
```

#### DNS Operation Audit Log
```sql
CREATE TABLE forge_dns_audit_log (
  log_id TEXT PRIMARY KEY,
  operation_type TEXT,                     -- 'create', 'update', 'delete', 'renew'
  resource_type TEXT,                      -- 'subdomain', 'record', 'certificate'
  resource_id TEXT,
  actor TEXT,                              -- 'system', 'deployment_pipeline', etc.
  details JSON,                            -- Full details of operation
  status TEXT,                             -- 'success', 'failed'
  error_message TEXT,
  created_at TEXT NOT NULL
);
```

#### Certificate Renewal History
```sql
CREATE TABLE forge_certificate_renewals (
  renewal_id TEXT PRIMARY KEY,
  certificate_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  previous_expires_at TEXT,
  new_expires_at TEXT,
  renewed_at TEXT NOT NULL,
  deployed_at TEXT,
  status TEXT,                             -- 'pending', 'deployed', 'failed'
  FOREIGN KEY (certificate_id) REFERENCES certificates(id)
);
```

### 6.7 Security & Isolation

#### DNS Provider Credentials
- Stored encrypted in environment variables or secrets management system
- API keys rotated quarterly
- Least-privilege access: create/update DNS records only, not domain registration
- All API calls logged with timestamp and actor

#### Subdomain Access Control
- Only deployment pipeline can request new subdomains
- Agent cannot request its own subdomain (security boundary)
- Subdomain deletion requires explicit authorization
- Audit trail captures all subdomain operations

#### Certificate Management
- Wildcard certificate minimizes number of certs in use
- Certificate private key never exposed outside TLS terminator
- Certificate renewal automated; no manual intervention
- Let's Encrypt validation via DNS challenge (no public HTTP exposure)

---

## 7. Implementation Plan

### Phase 1: Infrastructure Setup (Week 1-2)
- [ ] Select and register with advanced DNS provider
- [ ] Set up DNS provider API access and credentials
- [ ] Create primary wildcard domain configuration
- [ ] Validate wildcard DNS record resolution
- [ ] Set up TLS certificate provisioning via Let's Encrypt
- [ ] Create database tables for domain configuration + audit log
- [ ] Write integration tests for DNS provider API

### Phase 2: Subdomain Provisioning (Week 2-3)
- [ ] Implement `createSubdomain()` tool
- [ ] Add DNS A record creation logic
- [ ] Implement DNS propagation validation
- [ ] Integrate with deployment pipeline
- [ ] Add subdomain registry table
- [ ] Write unit + integration tests for subdomain creation
- [ ] Test with 10+ concurrent subdomain creations

### Phase 3: Hertzner Integration (Week 3-4)
- [ ] Implement Hertzner API polling service
- [ ] Add IP change detection + DNS update logic
- [ ] Implement rollback mechanism
- [ ] Add monitoring and alerting
- [ ] Test IP change scenarios
- [ ] Write integration tests for Hertzner failover

### Phase 4: Certificate Management (Week 4-5)
- [ ] Implement certificate provisioning via Let's Encrypt
- [ ] Add certificate renewal scheduler
- [ ] Implement certificate deployment to TLS terminator
- [ ] Add certificate expiry monitoring
- [ ] Write tests for renewal workflow
- [ ] Test end-to-end certificate lifecycle

### Phase 5: Monitoring & Operations (Week 5-6)
- [ ] Implement DNS health check service (global regions)
- [ ] Add alerting for DNS failures, certificate expiries
- [ ] Build operations dashboard
- [ ] Create runbooks for common scenarios
- [ ] Implement metrics collection (latency, uptime)
- [ ] Write operational documentation

### Phase 6: Migration & Validation (Week 6-7)
- [ ] Prepare domain migration plan
- [ ] Execute migration with zero downtime
- [ ] Validate all existing agent subdomains
- [ ] Monitor DNS propagation during migration
- [ ] Decommission old registrar
- [ ] Final testing and sign-off

---

## 8. Data Flow & Interactions

### Subdomain Creation Flow
```
Deployment Pipeline
  │
  └─ Deploy Agent
     │
     └─ tool call: createSubdomain({
          agentId: "agent-sales-01",
          environment: "production"
        })
        │
        ├─ Generate name: "agent-sales-01-xyz123"
        ├─ Validate uniqueness
        ├─ Create DNS A record via Provider API
        │  ├─ Domain: agent-sales-01-xyz123.domain.com
        │  ├─ Target: 203.0.113.45 (Hertzner IP)
        │  ├─ TTL: 300
        │  └─ Record ID: cloudflare_abc123
        ├─ Wait for DNS propagation
        │  ├─ Query from 5 regions
        │  ├─ Verify resolution
        │  └─ Average latency: 150ms
        ├─ Insert into forge_subdomains
        │  ├─ agent_id, subdomain, fqdn
        │  ├─ dns_record_id, certificate_id
        │  └─ status: "active"
        ├─ Log to audit table
        └─ Return FQDN: "agent-sales-01-xyz123.domain.com"
           │
           └─ Agent accessible at:
              https://agent-sales-01-xyz123.domain.com
```

### DNS Update Flow (Hertzner IP Change)
```
Hertzner Polling Service
  │
  └─ Every 5 minutes: Poll Hertzner API
     │
     ├─ Query: GET /servers/{serverId}
     │  └─ Response: { ip: "203.0.113.100", status: "running" }
     │
     ├─ Compare with stored IP: 203.0.113.45
     │  └─ Detected change: 45 → 100
     │
     └─ IP Change Detected
        │
        ├─ Update wildcard DNS record
        │  └─ *.domain.com → 203.0.113.100
        │
        ├─ Update all A records
        │  └─ For all active subdomains
        │
        ├─ Validate DNS propagation
        │  ├─ Query from 5 regions
        │  └─ Verify all resolve to new IP
        │
        ├─ Health check: TCP connect to new IP
        │  └─ Success → proceed
        │  └─ Failure → rollback to 45, alert
        │
        ├─ Update forge_domain_config
        │  └─ current_hertzner_ip = "203.0.113.100"
        │
        ├─ Log to audit table
        │  ├─ operation: "ip_change"
        │  ├─ old_ip, new_ip, timestamp
        │  └─ validation_result: "success"
        │
        └─ Alert Operations Team
           └─ "Hertzner IP updated from 45 to 100, all subdomains verified"
```

### Certificate Renewal Flow
```
Certificate Renewal Scheduler
  │
  └─ Daily: Check certificate expiries
     │
     ├─ Query forge_certificate_renewals
     │  └─ Find certs expiring within 30 days
     │
     └─ For each certificate needing renewal
        │
        ├─ Request new wildcard cert for *.domain.com
        │  └─ Via Let's Encrypt ACME protocol
        │
        ├─ DNS validation
        │  ├─ Create TXT record for ACME challenge
        │  ├─ Let's Encrypt validates
        │  └─ Remove TXT record
        │
        ├─ Certificate provisioned
        │  └─ New certificate ID: le_cert_v2_2026
        │
        ├─ Deploy to TLS terminator
        │  ├─ POST /certificates (new cert)
        │  ├─ Set as active
        │  └─ Verify TLS handshake
        │
        ├─ Insert renewal record
        │  ├─ previous_expires_at
        │  ├─ new_expires_at
        │  └─ deployed_at: now
        │
        ├─ Revoke old certificate
        │  └─ Prevents key reuse
        │
        └─ Log to audit table
           └─ "Certificate renewed, new expiry: 2027-03-15"
```

---

## 9. API Reference

### createSubdomain()

**Type:** Tool (agent function)
**Module:** `packages/mastra-engine/src/domain/tools/subdomain.ts`
**Caller:** Deployment pipeline (system)

```typescript
tool.createSubdomain({
  agentId: "agent-sales-01",
  environment: "production",
  customName?: "sales-agent-v2",
  metadata?: { team: "sales", region: "us-east" }
}): Promise<{
  fqdn: string;                    // "agent-sales-01.domain.com"
  subdomain: string;               // "agent-sales-01"
  agentId: string;
  dnsRecordId: string;
  certificateId: string;
  status: "active" | "creating" | "failed";
  createdAt: string;
  expiresAt?: string;
}>
```

### getDnsStatus()

```typescript
tool.getDnsStatus({
  subdomain: string,
  checkGlobal?: boolean
}): Promise<{
  subdomain: string;
  fqdn: string;
  resolvedIp: string;
  status: "active" | "propagating" | "failed";
  queryResults?: {
    region: string;
    resolvedIp: string;
    latency: number;
    status: "resolved" | "timeout" | "error";
  }[];
  lastChecked: string;
}>
```

### updateDnsRecord()

```typescript
tool.updateDnsRecord({
  recordId: string,
  target: string,
  ttl?: number,
  force?: boolean
}): Promise<{
  recordId: string;
  updatedAt: string;
  propagationStatus: "pending" | "propagated" | "failed";
  propagationEta?: number;
  validationResult?: {
    queriedRegions: string[];
    allResolved: boolean;
    unresolvedRegions?: string[];
  };
}>
```

### decommissionSubdomain()

```typescript
tool.decommissionSubdomain({
  agentId: string,
  reason?: string,
  immediateDelete?: boolean
}): Promise<{
  success: boolean;
  agentId: string;
  subdomain: string;
  decommissionedAt: string;
  gracePeriodUntil?: string;       // If not immediate
  resourcesCleaned: boolean;
}>
```

---

## 10. Configuration & Deployment

### Environment Variables

```bash
# DNS Provider Configuration
DOMAIN_PRIMARY_DOMAIN=domain.com
DOMAIN_DNS_PROVIDER=cloudflare  # or 'route53'
DOMAIN_DNS_API_KEY=<encrypted>
DOMAIN_DNS_API_SECRET=<encrypted>

# Hertzner Configuration
DOMAIN_HERTZNER_SERVER_ID=abc123def456
DOMAIN_HERTZNER_API_TOKEN=<encrypted>
DOMAIN_HERTZNER_POLLING_INTERVAL_MINUTES=5

# TLS/Certificate Configuration
DOMAIN_CERTIFICATE_PROVIDER=letsencrypt
DOMAIN_TLS_TERMINATOR_URL=https://tls-proxy.internal:8443
DOMAIN_CERTIFICATE_AUTO_RENEWAL_DAYS=30

# Monitoring
DOMAIN_MONITORING_ENABLED=true
DOMAIN_DNS_CHECK_REGIONS=us-east,eu-west,ap-southeast
DOMAIN_ALERT_WEBHOOK_URL=https://alerts.internal/webhook
```

### Monitoring & Observability

**Metrics:**
- `domain_subdomain_created_total` — Counter, labeled with environment
- `domain_subdomain_active_count` — Gauge
- `domain_dns_resolution_latency_ms` — Histogram
- `domain_dns_propagation_time_seconds` — Histogram
- `domain_certificate_expiry_days` — Gauge per certificate
- `domain_hertzner_ip_changes_total` — Counter
- `domain_dns_provider_api_calls_total` — Counter, labeled with method/status

**Logs:**
- Creation: `[DOMAIN] Subdomain created: {subdomain}.domain.com for {agentId}`
- IP Change: `[DOMAIN] Hertzner IP changed: {oldIp} → {newIp}, DNS updated`
- Certificate: `[DOMAIN] Certificate renewed for *.domain.com, expires: {date}`
- Error: `[DOMAIN_ERROR] {operation}: {error}`

**Dashboard:**
- Overall DNS Health (Green/Yellow/Red)
- Active Subdomains (count + list)
- Certificate Expiries (timeline)
- Hertzner IP History (recent changes)
- DNS Propagation Status (regional coverage)
- API Error Rate (last 24 hours)

---

## 11. Testing Strategy

### Unit Tests

**DNS Provider Integration:**
- ✅ Create DNS record via API (mocked)
- ✅ Update DNS record via API
- ✅ Delete DNS record via API
- ✅ Query DNS record status
- ✅ Handle API errors (rate limit, auth, timeout)
- ✅ Retry logic on transient failures

**Subdomain Generation:**
- ✅ Generate unique subdomain names
- ✅ Handle custom names
- ✅ Validate subdomain format (DNS-compliant)
- ✅ Detect duplicates
- ✅ Reject invalid names

**Certificate Management:**
- ✅ Parse certificate expiry dates
- ✅ Calculate renewal timing
- ✅ Identify certificates needing renewal
- ✅ Generate ACME challenge requests
- ✅ Validate certificate chain

### Integration Tests

**Subdomain Lifecycle:**
- ✅ Create subdomain end-to-end
- ✅ Verify DNS propagation (with real DNS queries)
- ✅ Test DNS resolution from multiple regions
- ✅ Decommission subdomain
- ✅ Verify DNS record cleanup

**Hertzner Integration:**
- ✅ Poll Hertzner API successfully
- ✅ Detect IP changes
- ✅ Update DNS records on IP change
- ✅ Validate DNS propagation after update
- ✅ Handle Hertzner API errors gracefully
- ✅ Rollback on validation failure

**Certificate Renewal:**
- ✅ Detect certificate expiring in 30 days
- ✅ Request new certificate
- ✅ Complete ACME validation
- ✅ Deploy certificate to TLS terminator
- ✅ Verify TLS connectivity
- ✅ Revoke old certificate

### End-to-End Tests

**Scenario: New Agent Deployment**
1. Deploy agent application
2. Call createSubdomain()
3. Verify DNS resolution globally
4. Connect to agent via HTTPS (wildcard cert)
5. Verify TLS certificate validity
6. Success criteria: Complete within 10 seconds

**Scenario: Hertzner IP Change**
1. Change Hertzner IP in test environment
2. Trigger Hertzner polling
3. Verify DNS update detected and executed
4. Verify global DNS propagation
5. Verify agent still accessible
6. Success criteria: Zero downtime, <2 minutes recovery

**Scenario: Certificate Renewal**
1. Create certificate with expiry in 30 days
2. Trigger renewal scheduler
3. Verify new certificate provisioned
4. Verify deployment to TLS terminator
5. Verify TLS handshake succeeds
6. Verify old cert revoked
7. Success criteria: Renewal completes without downtime

**Scenario: Multiple Concurrent Subdomains**
1. Create 50 subdomains concurrently
2. Verify all DNS records created
3. Verify all DNS resolution succeeds
4. Verify database consistency
5. Success criteria: All active within 60 seconds, zero failures

---

## 12. Risks & Mitigation

| Risk | Impact | Mitigation |
| --- | --- | --- |
| **DNS Propagation Delay** | Deployment blocked waiting for DNS sync | Async propagation; return "creating" status; async notification on completion |
| **DNS Provider API Outage** | Cannot create/update subdomains | Implement circuit breaker; fallback to manual DNS management; queue requests for retry |
| **Hertzner IP Change Not Detected** | DNS points to old IP, agents unreachable | Implement multiple detection mechanisms (polling + webhooks); alert on missed checks |
| **Certificate Expiry Forgotten** | TLS breaks, agents unreachable | Automated renewal 30+ days before; alert at 30, 14, 7, 1 days; pre-stage new cert |
| **DNS Cache Stale** | Old IP still resolves in some regions | Set TTL to 300 seconds; account for cache propagation in validation |
| **Wildcard Record Conflicts** | Multiple A records or MX records conflict | Validate DNS structure; prevent non-wildcard records in same zone |
| **Subdomain Name Collisions** | Two agents assigned same subdomain | Enforce uniqueness at creation; check existing records before creation |
| **TLS Terminator Down** | HTTPS fails, agents unreachable | Monitor TLS terminator health; auto-failover to secondary; alert operations |

---

## 13. Future Enhancements

### Short Term (1-2 Sprints)
- [ ] DNS failover to secondary provider
- [ ] Subdomain custom naming preferences
- [ ] DNS record history and rollback
- [ ] Certificate pinning for high-security agents
- [ ] Multi-region DNS routing (geo-location aware)

### Medium Term (2-3 Sprints)
- [ ] Automated domain renewal (before expiry)
- [ ] DNS analytics and query logging
- [ ] SLA monitoring with automatic escalation
- [ ] Custom domain support per agent (premium feature)
- [ ] DNSSEC signing and validation

### Long Term (3+ Sprints)
- [ ] Global CDN integration for DNS (Anycast)
- [ ] Multi-cloud DNS management (AWS, GCP, Azure)
- [ ] AI-driven DNS anomaly detection
- [ ] Decentralized DNS alternatives (ENS integration)
- [ ] DNS rate limiting and DDoS protection
- [ ] GraphQL API for domain management
- [ ] Web UI for domain operations and monitoring

---

## Appendix A: Domain Migration Checklist

```
Phase 1: Preparation (1 week before)
  ☐ Choose new DNS provider (Cloudflare, Route53, etc.)
  ☐ Register account and gain API access
  ☐ Create API credentials (least-privilege)
  ☐ Backup current DNS records from existing registrar
  ☐ Document all agent subdomains (current state)
  ☐ Plan maintenance window (if needed)

Phase 2: New Provider Setup (3-5 days)
  ☐ Add domain to new DNS provider
  ☐ Create wildcard A record (*.domain.com → Hertzner IP)
  ☐ Verify wildcard resolution from multiple regions
  ☐ Test DNS provider API connectivity
  ☐ Set up monitoring/alerting in new provider

Phase 3: Nameserver Update (1-2 days)
  ☐ Get nameservers from new provider
  ☐ Update nameserver delegation at current registrar
  ☐ Monitor DNS propagation (expect 24-48 hours)
  ☐ Query from multiple regions to verify update
  ☐ Alert when 99% propagated

Phase 4: Agent Validation (1 day)
  ☐ Script to validate all agent subdomains resolve correctly
  ☐ Test HTTPS connectivity to 10% of agents
  ☐ Test HTTPS connectivity to all agents
  ☐ Monitor logs for DNS resolution failures
  ☐ Verify certificate validity for all agents

Phase 5: Old Registrar Cleanup (1 week after)
  ☐ Confirm new provider fully propagated
  ☐ Decommission old DNS records at old registrar
  ☐ Update domain contact information (if needed)
  ☐ Cancel old registrar service
  ☐ Archive old DNS records for audit trail
```

---

## Appendix B: Example: Deployment with Auto-Subdomain

```typescript
// Deployment Pipeline
async function deployAgent(agentConfig: AgentConfig) {
  // 1. Deploy application
  const appInstance = await deployToHertzner(agentConfig);

  // 2. Create subdomain automatically
  const subdomain = await tool.createSubdomain({
    agentId: agentConfig.id,
    environment: "production",
    metadata: {
      team: agentConfig.team,
      version: agentConfig.version,
      deploymentId: appInstance.id
    }
  });

  // 3. Configure agent with FQDN
  const agentInstance = await createAgent({
    id: agentConfig.id,
    instructions: agentConfig.instructions,
    endpoints: {
      webhookUrl: `https://${subdomain.fqdn}/webhook`,
      publicUrl: `https://${subdomain.fqdn}`
    }
  });

  // 4. Register in service discovery
  await registerService({
    agentId: agentConfig.id,
    fqdn: subdomain.fqdn,
    version: agentConfig.version
  });

  // 5. Return deployment result
  return {
    agentId: agentConfig.id,
    fqdn: subdomain.fqdn,
    publicUrl: `https://${subdomain.fqdn}`,
    status: "deployed"
  };
}

// Result for agent deployment:
// {
//   agentId: "agent-sales-01",
//   fqdn: "agent-sales-01.domain.com",
//   publicUrl: "https://agent-sales-01.domain.com",
//   status: "deployed"
// }
```

---

## Appendix C: Monitoring Dashboard Mockup

```
DOMAIN MANAGEMENT DASHBOARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OVERALL STATUS: ✅ HEALTHY (99.98% uptime)

┌─ SUBDOMAINS (532 active) ──────────────────────────────────────┐
│ ✅ 532 Active  | ⏳ 3 Creating  | ⛔ 0 Failed  | 📦 1,245 Total   │
└───────────────────────────────────────────────────────────────┘

┌─ DNS HEALTH ───────────────────────────────────────────────────┐
│ Global Resolution: ✅ 100% (5 regions)                          │
│ Average Latency: 145ms (P95: 250ms)                            │
│ Failed Queries: 0 (last 24h)                                    │
│ Last Health Check: 2 minutes ago                                │
└───────────────────────────────────────────────────────────────┘

┌─ CERTIFICATES ─────────────────────────────────────────────────┐
│ Domain: *.domain.com                                            │
│ Status: ✅ ACTIVE                                               │
│ Expires: 2027-03-15 (356 days)                                  │
│ Last Renewed: 2026-03-15                                        │
│ Next Renewal: 2027-02-14                                        │
└───────────────────────────────────────────────────────────────┘

┌─ HERTZNER INFRASTRUCTURE ──────────────────────────────────────┐
│ Server ID: abc123def456                                         │
│ Current IP: 203.0.113.100                                       │
│ Status: ✅ RUNNING                                              │
│ Last IP Change: 2026-03-10 (5 days ago)                         │
│ Reachability: ✅ OK (TCP 443 responds)                          │
└───────────────────────────────────────────────────────────────┘

┌─ RECENT ACTIVITY ──────────────────────────────────────────────┐
│ 14:32 ✅ Subdomain created: agent-research-02.domain.com       │
│ 14:15 ✅ Certificate renewed, expires 2027-03-15              │
│ 13:45 ✅ DNS health check passed (5 regions)                   │
│ 12:00 ✅ Hertzner polling OK, IP unchanged                     │
│ 11:30 ✅ Subdomain created: agent-qa-03.domain.com             │
└───────────────────────────────────────────────────────────────┘

TOP SUBDOMAINS BY TRAFFIC:
1. agent-sales-01.domain.com        (2.3M requests/day)
2. agent-support-01.domain.com      (1.8M requests/day)
3. agent-research-main.domain.com   (945K requests/day)
```

---

**Document Version:** 1.0
**Last Review:** 2026-03-15
**Next Review:** 2026-04-15
