# PRD-18: Marketing Platform Integration

**Status:** Planning
**Feature:** Marketing Platform Integration
**Last Updated:** 2026-03-15

---

## 1. Executive Summary

The Marketing Platform Integration feature enables agents to execute marketing campaigns and automate marketing workflows across multiple external marketing platforms. This system allows agents to create campaigns, manage audiences, schedule communications, track performance metrics, and optimize delivery through integrated marketing platforms like Mailchimp, HubSpot, ActiveCampaign, and others. By exposing marketing platform capabilities as agent tools, agents can orchestrate complex marketing workflows, personalize communications at scale, and make data-driven campaign decisions.

**Business Value:**
- Enable agents to automate end-to-end marketing campaign execution
- Integrate multi-channel marketing workflows (email, SMS, push notifications)
- Provide real-time campaign performance insights and optimization
- Support audience segmentation and personalization at scale
- Reduce manual marketing operations and enable dynamic campaign optimization
- Enable intelligent A/B testing and performance-based decision making
- Unlock new marketing automation use cases through agent-driven orchestration

---

## 2. Problem Statement

Current agents operate independently from marketing platforms and cannot:

1. Execute marketing campaigns across integrated platforms
2. Dynamically create and manage campaign audiences
3. Schedule and trigger time-sensitive marketing communications
4. Access real-time campaign performance metrics
5. Perform audience segmentation and personalization at scale
6. Orchestrate multi-step marketing workflows (e.g., customer journey automation)
7. Make informed, data-driven campaign optimization decisions
8. Coordinate marketing activities across multiple channels

This limitation prevents agents from managing complete marketing workflows and reduces the ability to leverage agent intelligence for campaign optimization and customer engagement.

---

## 3. Goals & Success Criteria

### Primary Goals

1. **Multi-Platform Integration**
   - Support integration with major marketing platforms (Mailchimp, HubSpot, ActiveCampaign, SendGrid, Twilio)
   - Provide unified API abstraction for platform-agnostic campaign management
   - Enable seamless switching between marketing platforms

2. **Campaign Management**
   - Agents can create, update, and monitor marketing campaigns
   - Support multiple campaign types (email, SMS, push notifications, social media)
   - Enable dynamic campaign scheduling and delivery optimization

3. **Audience & Segmentation**
   - Support audience creation, management, and real-time updates
   - Enable advanced segmentation based on behaviors, attributes, and engagement
   - Provide audience sync capabilities with platform-specific targeting

4. **Performance & Metrics**
   - Real-time access to campaign metrics (open rates, click rates, conversions)
   - Performance tracking at campaign and contact levels
   - Support for custom metrics and KPI monitoring

5. **Automation & Orchestration**
   - Enable multi-step marketing workflows (customer journeys)
   - Support conditional triggers and automated response chains
   - Enable A/B testing and performance-based optimization

6. **Data Security & Compliance**
   - Secure credential management for platform authentication
   - GDPR/CCPA compliance for marketing data handling
   - Audit logging for all marketing platform interactions
   - Privacy controls and consent management

### Success Criteria

- [ ] Support ≥5 major marketing platforms (Mailchimp, HubSpot, ActiveCampaign, SendGrid, Twilio)
- [ ] Campaign creation latency <2s average
- [ ] Real-time metrics update latency <5s
- [ ] Support audiences with >100K contacts without performance degradation
- [ ] Multi-step workflows execute with <1s step latency
- [ ] A/B tests can be created and monitored automatically
- [ ] All platform credentials encrypted and never logged
- [ ] 100% audit trail coverage for marketing operations
- [ ] Comprehensive documentation with ≥20 example workflows

---

## 4. Target Users & Use Cases

### Target Users

1. **Marketing Operations Agents** — Autonomous agents managing campaign lifecycle
2. **Campaign Optimization Agents** — Agents analyzing performance and optimizing delivery
3. **Customer Journey Agents** — Agents orchestrating multi-step customer engagement
4. **Content Distribution Agents** — Agents distributing content across channels
5. **Analytics & Insights Agents** — Agents monitoring campaigns and generating insights

### Key Use Cases

#### 4.1 Automated Email Campaign Execution
An internal "marketing operations" agent receives a campaign brief (subject, content, audience segment), creates a campaign in Mailchimp, applies proper segmentation, schedules delivery for optimal send times, and monitors open/click rates in real-time.

**Workflow:**
```
Marketing Operations Agent
  ├─ Receive: campaign brief with subject, content, target segment
  ├─ Create audience in marketing platform
  │  ├─ Filter by segment criteria (behavior, geography, engagement)
  │  ├─ Sync audience data
  │  └─ Apply platform-specific targeting
  ├─ Create email campaign
  │  ├─ Set subject, content, sender details
  │  ├─ Configure delivery optimization
  │  └─ Schedule for optimal send time
  ├─ Monitor campaign metrics (real-time)
  │  ├─ Track opens, clicks, unsubscribes
  │  ├─ Alert on anomalies
  │  └─ Provide performance dashboard
  └─ Generate campaign report
```

#### 4.2 Dynamic A/B Testing
An agent creates multiple campaign variants with different subject lines, content, or send times. The agent monitors performance in real-time, identifies the winner, and scales the winning variant to the remaining audience while pausing underperformers.

**Workflow:**
```
Campaign Optimization Agent
  ├─ Analyze campaign goal and audience segment
  ├─ Create A/B test campaigns
  │  ├─ Variant A: subject line 1, content 1, send time 1
  │  ├─ Variant B: subject line 2, content 2, send time 2
  │  └─ Allocate 50/50 to test audience
  ├─ Monitor test metrics
  │  ├─ Track open rate, click rate, conversion
  │  ├─ Calculate statistical significance
  │  └─ Determine winner
  ├─ Scale winner to remaining audience
  │  ├─ Create campaign with winning variant
  │  ├─ Schedule for full audience
  │  └─ Monitor scaled campaign performance
  └─ Archive test results and learnings
```

#### 4.3 Customer Journey Automation
An agent orchestrates a multi-step customer onboarding journey: welcome email → 2-day follow-up → segment-specific content → conversion nurture → win-back campaign. Each step triggers based on customer actions (opens, clicks, inactivity).

**Workflow:**
```
Customer Journey Agent
  ├─ Define journey stages
  │  ├─ Stage 1: Welcome email (trigger: contact added)
  │  ├─ Stage 2: Follow-up email (trigger: 2 days elapsed)
  │  ├─ Stage 3: Content delivery (trigger: click in stage 2)
  │  └─ Stage 4: Nurture sequence (trigger: no engagement for 5 days)
  ├─ Create automation workflow in platform
  ├─ Monitor journey progression
  │  ├─ Track contacts in each stage
  │  ├─ Monitor stage completion rates
  │  └─ Alert on drop-offs
  ├─ Optimize journey
  │  ├─ Adjust timing based on engagement
  │  ├─ Personalize content based on segment
  │  └─ Test different flow paths
  └─ Generate journey analytics
```

#### 4.4 Multi-Channel Campaign Distribution
An agent creates coordinated campaigns across email, SMS, and push notifications. The agent manages channel preferences per contact, optimizes send times per channel, and tracks cross-channel engagement metrics.

**Workflow:**
```
Content Distribution Agent
  ├─ Receive: campaign content and audience
  ├─ Create multi-channel campaign
  │  ├─ Email: main message with CTA
  │  ├─ SMS: concise offer + link
  │  └─ Push notification: urgency-driven message
  ├─ Apply channel preferences
  │  ├─ Respect opt-in status per channel
  │  ├─ Honor send time preferences
  │  └─ Apply frequency caps
  ├─ Optimize delivery
  │  ├─ Calculate optimal send time per channel
  │  ├─ Coordinate sends for impact
  │  └─ Monitor performance per channel
  ├─ Track engagement
  │  ├─ Cross-channel view of each contact
  │  ├─ Attribution modeling
  │  └─ Multi-touch conversion tracking
  └─ Report on channel performance
```

#### 4.5 Intelligent Audience Segmentation & Personalization
An agent analyzes customer data, identifies high-value segments, and creates targeted campaigns with personalized content for each segment. The agent continuously updates segments based on behavior changes and performance feedback.

**Workflow:**
```
Audience Insights Agent
  ├─ Analyze customer database
  │  ├─ Identify behavioral patterns
  │  ├─ Calculate customer lifetime value
  │  ├─ Segment by engagement level
  │  └─ Identify churn risk cohorts
  ├─ Create dynamic segments
  │  ├─ High-value engaged customers
  │  ├─ At-risk/churn prevention
  │  ├─ New/trial users
  │  ├─ Dormant/re-engagement
  │  └─ Geo/demographic segments
  ├─ Generate segment-specific campaigns
  │  ├─ Personalized messaging per segment
  │  ├─ Segment-optimized CTAs
  │  └─ Segment-specific offers/timing
  ├─ Monitor segment performance
  │  ├─ Track metrics by segment
  │  ├─ Identify underperformers
  │  └─ Alert on trend changes
  └─ Refine segments based on learnings
```

#### 4.6 Real-Time Performance Monitoring & Alerts
An agent continuously monitors active campaigns, tracks KPIs against targets, and triggers alerts or interventions when metrics diverge from expectations. The agent can pause underperforming campaigns or escalate to human review.

**Workflow:**
```
Campaign Monitoring Agent
  ├─ Monitor active campaigns (real-time)
  │  ├─ Track open rate vs. target
  │  ├─ Track click rate vs. target
  │  ├─ Track conversion rate vs. target
  │  ├─ Monitor unsubscribe rate
  │  └─ Track bounce rate
  ├─ Trigger alerts on anomalies
  │  ├─ Alert: Open rate >20% above target
  │  ├─ Alert: Unsubscribe rate exceeds 0.5%
  │  ├─ Alert: High bounce rate detected
  │  └─ Alert: Conversion trailing by >10%
  ├─ Take automatic actions
  │  ├─ Pause campaign if metrics critical
  │  ├─ Adjust send window for remaining sends
  │  └─ Escalate to human if needed
  ├─ Generate insights
  │  ├─ Identify what's working
  │  ├─ Recommend optimizations
  │  └─ Suggest audience adjustments
  └─ Update campaign strategy in real-time
```

---

## 5. Feature Overview & Design

### 5.1 Core Concepts

#### Marketing Platform Provider
A connector to a specific marketing platform (Mailchimp, HubSpot, ActiveCampaign, etc.). Each provider:
- Manages authentication and credential security
- Translates unified API calls to platform-specific calls
- Handles rate limiting and throttling
- Provides platform-specific capabilities and constraints

#### Campaign
A marketing communication instance with:
- `campaignId` — unique identifier
- `type` — email, SMS, push notification, social media
- `platform` — which marketing platform hosts it
- `audience` — target contacts/segments
- `content` — message templates and personalization
- `schedule` — when/how to send
- `metrics` — performance tracking

#### Audience
A targetable group of contacts with:
- `audienceId` — unique identifier
- `platform` — which platform stores it
- `contacts` — list of contact IDs or segment criteria
- `metadata` — contact attributes and segments
- `sync` — real-time sync configuration

#### Marketing Workflow
A multi-step, automated sequence with:
- `workflowId` — unique identifier
- `steps` — ordered sequence of actions
- `triggers` — conditions that advance workflow
- `branches` — conditional paths (A/B tests, segment-based)
- `analytics` — per-step metrics and conversion tracking

#### Marketing Metrics
Performance indicators tracked at campaign/contact/segment level:
- `opens` — email opens
- `clicks` — link clicks
- `conversions` — attributed conversions
- `unsubscribes` — opt-outs
- `bounces` — delivery failures
- `customMetrics` — platform-specific KPIs

### 5.2 Architecture Overview

```
Agent
  │
  ├─ tool: createMarketingCampaign({
  │    platform: "mailchimp",
  │    type: "email",
  │    audience: {...},
  │    content: {...},
  │    schedule: {...}
  │  })
  │  │
  │  └─ Marketing Platform Adapter Layer
  │     ├─ Resolve platform (Mailchimp, HubSpot, etc.)
  │     ├─ Translate to platform API
  │     ├─ Execute campaign creation
  │     ├─ Store campaign metadata
  │     └─ Return campaignId + status
  │
  ├─ tool: createAudience({
  │    platform: "mailchimp",
  │    segment: {...},
  │    sync: true
  │  })
  │  │
  │  └─ Audience Management Layer
  │     ├─ Resolve segment criteria
  │     ├─ Query contact database
  │     ├─ Create audience in platform
  │     ├─ Sync audience dynamically
  │     └─ Return audienceId + contact count
  │
  ├─ tool: getCampaignMetrics({
  │    campaignId: "...",
  │    includePerContact: false
  │  })
  │  │
  │  └─ Metrics & Analytics Layer
  │     ├─ Query platform for metrics
  │     ├─ Process metric data
  │     ├─ Calculate derived metrics
  │     └─ Return metrics + insights
  │
  └─ tool: createMarketingWorkflow({
     platform: "hubspot",
     steps: [...],
     triggers: {...}
   })
     │
     └─ Workflow Automation Layer
        ├─ Translate workflow to platform automation
        ├─ Create automation rules
        ├─ Configure triggers and branches
        └─ Enable workflow monitoring
```

### 5.3 Platform Support Architecture

Each marketing platform has a provider implementation:

```
Marketing Platform Integration
  ├─ providers/
  │  ├─ mailchimp-provider.ts
  │  │  ├─ authenticate(apiKey)
  │  │  ├─ createCampaign(config)
  │  │  ├─ createAudience(segment)
  │  │  ├─ getCampaignMetrics(campaignId)
  │  │  └─ createWorkflow(steps)
  │  │
  │  ├─ hubspot-provider.ts
  │  │  ├─ authenticate(apiKey)
  │  │  ├─ createCampaign(config)
  │  │  ├─ createAudience(segment)
  │  │  ├─ getCampaignMetrics(campaignId)
  │  │  └─ createWorkflow(steps)
  │  │
  │  ├─ activecampaign-provider.ts
  │  ├─ sendgrid-provider.ts
  │  └─ twilio-provider.ts
  │
  ├─ core/
  │  ├─ marketing-adapter.ts — unified API
  │  ├─ campaign-manager.ts
  │  ├─ audience-manager.ts
  │  ├─ metrics-engine.ts
  │  └─ workflow-engine.ts
  │
  └─ tools/ — exposed to agents
     ├─ create-campaign.ts
     ├─ create-audience.ts
     ├─ get-campaign-metrics.ts
     ├─ create-marketing-workflow.ts
     └─ manage-campaign.ts
```

### 5.4 Key Design Principles

1. **Multi-Platform Abstraction** — Agents work with unified API; platform differences handled internally
2. **Real-Time Performance** — Metrics updated in real-time without polling
3. **Secure Credential Management** — Platform credentials encrypted, never logged
4. **Audit & Compliance** — All marketing operations logged and auditable
5. **Scalability** — Support large audiences and high-volume campaigns
6. **Extensibility** — Easy to add new marketing platforms
7. **Agent-Driven** — Agents control full campaign lifecycle

---

## 6. Detailed Requirements

### 6.1 Campaign Management

**Tool:** `createMarketingCampaign()`
**Caller:** Marketing agents
**Location:** `packages/mastra-engine/src/marketing/tools/create-campaign.ts`

**Input:**
```typescript
interface CreateMarketingCampaignRequest {
  platform: "mailchimp" | "hubspot" | "activecampaign" | "sendgrid" | "twilio";
  type: "email" | "sms" | "push" | "social";
  name: string;
  description?: string;

  audience: {
    audienceId?: string;           // Existing audience ID
    segment?: SegmentCriteria;     // OR define inline segment
    excludeSegment?: SegmentCriteria;
    contactList?: string[];        // OR specific contact IDs
  };

  content: {
    subject?: string;              // For email
    body: string;
    plainText?: string;
    htmlContent?: string;
    personalization?: {
      firstName: boolean;
      lastName: boolean;
      customVariables?: Record<string, string>;
    };
    attachments?: Array<{
      filename: string;
      url: string;
    }>;
    cta?: {
      text: string;
      url: string;
      tracking?: boolean;
    };
  };

  schedule: {
    sendType: "immediate" | "scheduled" | "optimized";
    sendTime?: string;             // ISO 8601
    timezone?: string;
    recurringPattern?: string;     // cron format for recurring
  };

  settings: {
    replyTo?: string;
    trackingOptions?: {
      trackOpens: boolean;
      trackClicks: boolean;
      trackConversions?: boolean;
      conversionEvents?: string[];
    };
    frequencyCap?: {
      maxPerDay?: number;
      maxPerWeek?: number;
    };
    abTest?: {
      enabled: boolean;
      variants: Array<{
        id: string;
        subject?: string;
        content?: string;
        sendTime?: string;
        weight: number;           // percentage (0-100)
      }>;
      winnerCriteria: "openRate" | "clickRate" | "conversionRate";
      testDuration: number;       // hours
      scaleWinner?: boolean;
    };
  };
}
```

**Output:**
```typescript
interface CreateMarketingCampaignResponse {
  campaignId: string;
  platform: string;
  status: "draft" | "scheduled" | "sending" | "sent" | "error";
  audience: {
    audienceId: string;
    contactCount: number;
  };
  schedule: {
    sendTime: string;
    estimatedDeliveryTime: string;
  };
  createdAt: string;
  platformCampaignId: string;      // native platform ID for reference
}
```

**Behavior:**
1. Validate campaign configuration
2. Resolve or create audience
3. Prepare content with personalization
4. Call appropriate platform provider
5. Store campaign metadata in database
6. Return campaignId and status
7. Begin metrics polling if applicable

### 6.2 Audience Management

**Tool:** `createAudience()`
**Caller:** Marketing agents
**Location:** `packages/mastra-engine/src/marketing/tools/create-audience.ts`

**Input:**
```typescript
interface CreateAudienceRequest {
  platform: string;
  name: string;
  description?: string;

  source: {
    type: "segment" | "static_list" | "dynamic_sync";

    // For segment
    segment?: {
      criteria: Array<{
        field: string;             // e.g., "engagement_level", "location", "signup_date"
        operator: "equals" | "contains" | "gt" | "lt" | "in" | "between";
        value: string | string[] | number | number[];
      }>;
      logic: "AND" | "OR";         // How criteria combine
    };

    // For static list
    contacts?: string[];           // Contact IDs or emails

    // For dynamic sync
    syncConfig?: {
      sourceDatabase: string;
      refreshInterval: number;     // seconds
      mappingRules: Record<string, string>;
    };
  };

  tags?: string[];
  metadata?: Record<string, unknown>;
}
```

**Output:**
```typescript
interface CreateAudienceResponse {
  audienceId: string;
  platform: string;
  name: string;
  contactCount: number;
  status: "active" | "syncing" | "error";
  createdAt: string;
  platformAudienceId: string;      // native platform ID
}
```

**Behavior:**
1. Validate segment criteria or contact list
2. Query contact database for segment matching
3. Create audience in platform
4. Configure dynamic sync if applicable
5. Store audience metadata
6. Return audienceId and contact count

### 6.3 Campaign Metrics & Analytics

**Tool:** `getCampaignMetrics()`
**Caller:** Marketing agents
**Location:** `packages/mastra-engine/src/marketing/tools/get-campaign-metrics.ts`

**Input:**
```typescript
interface GetCampaignMetricsRequest {
  campaignId: string;
  includePerContact?: boolean;     // Expensive, use carefully
  breakdown?: "by_segment" | "by_day" | "by_hour";
  limit?: number;                  // for per-contact metrics (default: 100)
}
```

**Output:**
```typescript
interface CampaignMetrics {
  campaignId: string;
  status: string;

  aggregate: {
    contactsSent: number;
    contactsDelivered: number;
    contactsBounced: number;
    deliveryRate: number;          // %

    opens: number;
    openRate: number;              // %
    uniqueOpens: number;

    clicks: number;
    clickRate: number;             // %
    uniqueClicks: number;

    conversions?: number;
    conversionRate?: number;
    revenue?: number;

    unsubscribes: number;
    unsubscribeRate: number;
    complaints: number;

    estimatedEngagementScore?: number;
  };

  breakdown?: {
    // if breakdown requested
    bySegment?: Record<string, any>;
    byDay?: Record<string, any>;
    byHour?: Record<string, any>;
  };

  perContact?: Array<{
    contactId: string;
    email: string;
    opens: number;
    clicks: number;
    conversions?: number;
    lastEngagedAt?: string;
  }>;

  insights?: {
    bestPerformingSegment?: string;
    optimalSendTime?: string;
    recommendedNextAction?: string;
  };

  lastUpdated: string;
  refreshRate: string;             // How often updated
}
```

**Behavior:**
1. Query platform for campaign metrics
2. Process and normalize metrics
3. Calculate derived metrics (engagement score, etc.)
4. Generate insights if requested
5. Cache results (refresh every 5-10 minutes)
6. Return comprehensive metrics view

### 6.4 Marketing Workflows (Automation)

**Tool:** `createMarketingWorkflow()`
**Caller:** Marketing agents
**Location:** `packages/mastra-engine/src/marketing/tools/create-workflow.ts`

**Input:**
```typescript
interface CreateMarketingWorkflowRequest {
  platform: string;
  name: string;
  description?: string;

  trigger: {
    type: "contact_added" | "date_based" | "behavioral" | "custom";
    criteria?: {
      event: string;
      value?: string;
      timeWindow?: number;         // seconds
    };
  };

  steps: Array<{
    id: string;
    type: "send_email" | "send_sms" | "wait" | "conditional" | "api_call";
    config: any;                  // Step-specific config

    // For send_email
    emailConfig?: {
      templateId?: string;
      content?: string;
      subject?: string;
      personalization?: boolean;
    };

    // For wait
    waitConfig?: {
      duration: number;            // seconds
    };

    // For conditional
    conditionalConfig?: {
      condition: {
        field: string;
        operator: "equals" | "contains" | "gt" | "lt";
        value: string | number;
      };
      trueBranch: string;          // next step ID
      falseBranch: string;         // alternate step ID
    };
  }>;

  branches?: Array<{
    id: string;
    name: string;
    condition: {
      field: string;
      operator: string;
      value: unknown;
    };
    steps: string[];               // step IDs in this branch
  }>;

  exitConditions?: Array<{
    type: "unsubscribe" | "bounce" | "max_tries";
  }>;
}
```

**Output:**
```typescript
interface CreateMarketingWorkflowResponse {
  workflowId: string;
  platform: string;
  name: string;
  status: "active" | "paused" | "draft" | "error";
  trigger: {
    type: string;
  };
  stepCount: number;
  createdAt: string;
  platformWorkflowId: string;
}
```

**Behavior:**
1. Validate workflow structure
2. Translate to platform-specific automation
3. Create workflow in platform
4. Enable monitoring and metrics
5. Store workflow metadata
6. Return workflowId and status

### 6.5 Storage & Persistence

**New Tables:**
Location: `packages/mastra-engine/src/marketing/store.ts`

```sql
-- Marketing Campaigns
CREATE TABLE forge_marketing_campaigns (
  campaign_id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  campaign_type TEXT NOT NULL,        -- email, sms, push, social
  name TEXT NOT NULL,
  description TEXT,
  audience_id TEXT,
  content_hash TEXT,                  -- for deduplication
  status TEXT DEFAULT 'draft',        -- draft, scheduled, sending, sent, paused, error
  schedule_config JSON,
  ab_test_config JSON,
  created_at TEXT NOT NULL,
  scheduled_at TEXT,
  sent_at TEXT,
  metadata JSON,
  platform_campaign_id TEXT,          -- native ID
  FOREIGN KEY (agent_id) REFERENCES forge_agents
);

-- Marketing Audiences
CREATE TABLE forge_marketing_audiences (
  audience_id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  source_type TEXT,                   -- segment, static_list, dynamic_sync
  segment_criteria JSON,
  contact_count INTEGER,
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL,
  last_synced_at TEXT,
  metadata JSON,
  platform_audience_id TEXT,
  FOREIGN KEY (agent_id) REFERENCES forge_agents
);

-- Campaign Metrics (snapshot)
CREATE TABLE forge_marketing_metrics (
  metric_id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  contacts_sent INTEGER,
  contacts_delivered INTEGER,
  contacts_bounced INTEGER,
  delivery_rate REAL,
  opens INTEGER,
  open_rate REAL,
  unique_opens INTEGER,
  clicks INTEGER,
  click_rate REAL,
  unique_clicks INTEGER,
  conversions INTEGER,
  conversion_rate REAL,
  revenue REAL,
  unsubscribes INTEGER,
  unsubscribe_rate REAL,
  complaints INTEGER,
  engagement_score REAL,
  snapshot_at TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES forge_marketing_campaigns
);

-- Marketing Workflows (Automations)
CREATE TABLE forge_marketing_workflows (
  workflow_id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_config JSON,
  steps JSON,
  status TEXT DEFAULT 'draft',        -- draft, active, paused, error
  created_at TEXT NOT NULL,
  activated_at TEXT,
  contacts_in_workflow INTEGER DEFAULT 0,
  metadata JSON,
  platform_workflow_id TEXT,
  FOREIGN KEY (agent_id) REFERENCES forge_agents
);

-- Marketing Credentials (encrypted)
CREATE TABLE forge_marketing_credentials (
  credential_id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  encrypted_secret TEXT,
  account_id TEXT,
  status TEXT DEFAULT 'active',       -- active, revoked, expired
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  UNIQUE(platform, agent_id),
  FOREIGN KEY (agent_id) REFERENCES forge_agents
);

-- Audit Log
CREATE TABLE forge_marketing_audit_log (
  log_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  campaign_id TEXT,
  workflow_id TEXT,
  action TEXT,                        -- create_campaign, update_campaign, send_campaign, etc.
  resource_type TEXT,                 -- campaign, workflow, audience, metric
  details JSON,
  created_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES forge_agents
);
```

### 6.6 Platform Provider Interface

All platform providers implement this interface:

```typescript
interface MarketingProvider {
  // Authentication
  authenticate(credentials: ProviderCredentials): Promise<void>;
  validateCredentials(): Promise<boolean>;

  // Campaign Operations
  createCampaign(config: CampaignConfig): Promise<string>;
  updateCampaign(campaignId: string, config: Partial<CampaignConfig>): Promise<void>;
  getCampaign(campaignId: string): Promise<CampaignDetail>;
  listCampaigns(filter?: CampaignFilter): Promise<Campaign[]>;
  sendCampaign(campaignId: string): Promise<SendResponse>;
  pauseCampaign(campaignId: string): Promise<void>;
  cancelCampaign(campaignId: string): Promise<void>;

  // Audience Operations
  createAudience(config: AudienceConfig): Promise<string>;
  updateAudience(audienceId: string, config: Partial<AudienceConfig>): Promise<void>;
  getAudience(audienceId: string): Promise<AudienceDetail>;
  listAudiences(): Promise<Audience[]>;
  syncAudience(audienceId: string): Promise<SyncResponse>;

  // Metrics
  getCampaignMetrics(campaignId: string): Promise<CampaignMetrics>;
  getAudienceMetrics(audienceId: string): Promise<AudienceMetrics>;

  // Workflows
  createWorkflow(config: WorkflowConfig): Promise<string>;
  updateWorkflow(workflowId: string, config: Partial<WorkflowConfig>): Promise<void>;
  activateWorkflow(workflowId: string): Promise<void>;
  pauseWorkflow(workflowId: string): Promise<void>;
  getWorkflow(workflowId: string): Promise<WorkflowDetail>;
}
```

### 6.7 Security & Credential Management

**Credential Storage:**
- All API keys encrypted using AES-256-GCM
- Stored separately from campaign metadata
- Never logged or exposed in responses
- Rotation support via credential versioning
- Audit trail of credential access

**Platform-Specific Security:**
- OAuth 2.0 support for platforms that provide it
- Webhook signature verification
- Rate limiting per platform (respect platform limits)
- Timeout protection on API calls

**Audit Logging:**
- All marketing operations logged
- Campaign creation, sending, modification logged
- Metric retrieval logged
- Credential access logged (time, action, result)
- Failed operations logged with error details

---

## 7. Implementation Plan

### Phase 1: Foundation & Mailchimp (Week 1-2)
- [ ] Design unified marketing adapter API
- [ ] Create marketing types and interfaces
- [ ] Implement Mailchimp provider with authentication
- [ ] Implement campaign creation for Mailchimp
- [ ] Implement audience management for Mailchimp
- [ ] Add encryption for credentials
- [ ] Write unit tests for adapter and Mailchimp provider
- [ ] Create initial database schema

### Phase 2: HubSpot & Metrics (Week 2-3)
- [ ] Implement HubSpot provider
- [ ] Implement campaign metrics retrieval
- [ ] Add real-time metrics polling
- [ ] Implement metrics caching and refresh strategy
- [ ] Create metrics dashboard tool
- [ ] Write integration tests for campaign flow
- [ ] Add audit logging infrastructure

### Phase 3: Workflows & Additional Platforms (Week 3-4)
- [ ] Implement workflow/automation creation
- [ ] Implement ActiveCampaign provider
- [ ] Implement SendGrid provider
- [ ] Implement Twilio provider
- [ ] Test multi-platform campaign execution
- [ ] Write end-to-end workflow tests
- [ ] Performance optimization and load testing

### Phase 4: Advanced Features & Documentation (Week 4-5)
- [ ] Implement A/B testing automation
- [ ] Add segment-based personalization
- [ ] Implement workflow branching and conditions
- [ ] Add conversion tracking
- [ ] Comprehensive documentation and examples
- [ ] API reference documentation
- [ ] Security review and hardening

---

## 8. Data Flow & Interactions

### Campaign Creation Flow
```
Agent
  │
  └─ createMarketingCampaign({
       platform: "mailchimp",
       type: "email",
       audience: { segment: {...} },
       content: {...},
       schedule: {...}
     })
     │
     ├─ Marketing Adapter
     │  ├─ Validate campaign config
     │  ├─ Generate campaignId
     │  └─ Resolve platform provider
     │
     ├─ Platform Provider (Mailchimp)
     │  ├─ Authenticate (fetch from encrypted store)
     │  ├─ Create audience (if needed)
     │  ├─ Create campaign via Mailchimp API
     │  ├─ Configure tracking
     │  └─ Return platformCampaignId
     │
     ├─ Storage
     │  ├─ Insert into forge_marketing_campaigns
     │  ├─ Log to audit_log
     │  └─ Store metrics baseline
     │
     └─ Agent receives campaignId, status
```

### Metrics Retrieval & Real-Time Polling
```
Agent
  │
  └─ getCampaignMetrics({
       campaignId: "...",
       breakdown: "by_segment"
     })
     │
     ├─ Check cache (5-min TTL)
     │  └─ If fresh, return cached metrics
     │
     ├─ If stale, query platform
     │  ├─ Platform Provider
     │  │  ├─ Call platform API
     │  │  └─ Return raw metrics
     │  │
     │  ├─ Normalize & process
     │  │  ├─ Calculate derived metrics
     │  │  ├─ Generate insights
     │  │  └─ Cache result
     │  │
     │  └─ Store snapshot in metrics table
     │
     └─ Agent receives metrics + insights
```

### Workflow Execution Flow
```
Agent
  │
  └─ createMarketingWorkflow({
       trigger: { type: "contact_added" },
       steps: [
         { type: "send_email", ... },
         { type: "wait", duration: 86400 },
         { type: "send_email", ... }
       ]
     })
     │
     ├─ Workflow Engine
     │  ├─ Validate workflow structure
     │  ├─ Translate to platform format
     │  └─ Generate workflowId
     │
     ├─ Platform Provider
     │  ├─ Create automation in platform
     │  ├─ Configure trigger
     │  ├─ Configure steps/actions
     │  └─ Activate workflow
     │
     ├─ Storage
     │  ├─ Insert into forge_marketing_workflows
     │  └─ Start monitoring contacts in workflow
     │
     └─ Agent receives workflowId, status
```

---

## 9. API Reference

### createMarketingCampaign()

**Type:** Tool (agent function)
**Module:** `packages/mastra-engine/src/marketing/tools/create-campaign.ts`

```typescript
tool.createMarketingCampaign({
  platform: "mailchimp",
  type: "email",
  name: "Q1 Product Launch",
  audience: {
    segment: {
      criteria: [
        { field: "signup_date", operator: "gt", value: "2025-01-01" },
        { field: "engagement_level", operator: "equals", value: "high" }
      ]
    }
  },
  content: {
    subject: "Introducing Our Q1 Product",
    body: "Check out our new features...",
    cta: { text: "Learn More", url: "https://..." }
  },
  schedule: {
    sendType: "optimized",
    timezone: "America/New_York"
  },
  settings: {
    trackingOptions: {
      trackOpens: true,
      trackClicks: true,
      trackConversions: true
    }
  }
}): Promise<{
  campaignId: string;
  platform: string;
  status: "draft" | "scheduled";
  audience: { audienceId: string; contactCount: number };
  createdAt: string;
}>
```

### getCampaignMetrics()

```typescript
tool.getCampaignMetrics({
  campaignId: "camp_123",
  breakdown: "by_segment"
}): Promise<{
  campaignId: string;
  status: string;
  aggregate: {
    contactsSent: number;
    contactsDelivered: number;
    openRate: number;
    clickRate: number;
    conversionRate?: number;
  };
  breakdown?: {
    bySegment?: Record<string, any>;
  };
  insights?: {
    bestPerformingSegment?: string;
    optimalSendTime?: string;
    recommendedNextAction?: string;
  };
  lastUpdated: string;
}>
```

### createMarketingWorkflow()

```typescript
tool.createMarketingWorkflow({
  platform: "hubspot",
  name: "Onboarding Journey",
  trigger: { type: "contact_added" },
  steps: [
    {
      id: "welcome_email",
      type: "send_email",
      emailConfig: {
        templateId: "welcome_template",
        personalization: true
      }
    },
    {
      id: "wait_2d",
      type: "wait",
      waitConfig: { duration: 172800 }
    },
    {
      id: "followup_email",
      type: "send_email",
      emailConfig: {
        templateId: "followup_template"
      }
    }
  ]
}): Promise<{
  workflowId: string;
  platform: string;
  status: "active" | "draft";
  stepCount: number;
  createdAt: string;
}>
```

### createAudience()

```typescript
tool.createAudience({
  platform: "mailchimp",
  name: "High-Value Engaged",
  source: {
    type: "segment",
    segment: {
      criteria: [
        { field: "ltv", operator: "gt", value: 5000 },
        { field: "engagement_score", operator: "gt", value: 80 }
      ],
      logic: "AND"
    }
  }
}): Promise<{
  audienceId: string;
  platform: string;
  contactCount: number;
  status: "active";
  createdAt: string;
}>
```

---

## 10. Configuration & Deployment

### Environment Configuration

**Marketing Platform Credentials:**
```bash
# Mailchimp
MAILCHIMP_API_KEY=<encrypted>

# HubSpot
HUBSPOT_API_KEY=<encrypted>

# ActiveCampaign
ACTIVECAMPAIGN_API_KEY=<encrypted>
ACTIVECAMPAIGN_ACCOUNT_ID=<encrypted>

# SendGrid
SENDGRID_API_KEY=<encrypted>

# Twilio
TWILIO_ACCOUNT_SID=<encrypted>
TWILIO_AUTH_TOKEN=<encrypted>
```

**Marketing Configuration:**
```bash
# Defaults
MARKETING_METRICS_REFRESH_INTERVAL_SECONDS=300
MARKETING_METRICS_CACHE_TTL_SECONDS=300
MARKETING_MAX_AUDIENCE_SIZE=1000000
MARKETING_MAX_CAMPAIGNS_PER_AGENT=100
MARKETING_AUDIT_LOG_RETENTION_DAYS=90

# Rate limiting
MARKETING_RATE_LIMIT_PER_MINUTE=60
MARKETING_RATE_LIMIT_PER_HOUR=1000

# A/B Testing
MARKETING_AB_TEST_MIN_SAMPLE_SIZE=100
MARKETING_AB_TEST_CONFIDENCE_LEVEL=0.95
```

### Monitoring & Observability

**Metrics:**
- `marketing_campaign_created_total` — counter, labeled by platform, type
- `marketing_campaign_sent_total` — counter, labeled by platform, status
- `marketing_campaign_send_latency_ms` — histogram
- `marketing_metrics_update_latency_ms` — histogram
- `marketing_workflow_created_total` — counter
- `marketing_workflow_active_count` — gauge
- `marketing_audience_sync_latency_ms` — histogram
- `marketing_platform_api_errors_total` — counter by platform

**Logs:**
- Campaign creation: `[MARKETING] Campaign created {campaignId} on {platform}`
- Campaign send: `[MARKETING] Campaign {campaignId} sent to {contactCount} contacts`
- Metrics update: `[MARKETING] Updated metrics for {campaignId}: {openRate}% opens`
- Errors: `[MARKETING_ERROR] {platform}: {operation} failed: {error}`

---

## 11. Testing Strategy

### Unit Tests

**Campaign Management:**
- ✅ Campaign creation with valid config succeeds
- ✅ Invalid segment criteria rejected
- ✅ A/B test configuration validated
- ✅ Content personalization substitutions work
- ✅ Frequency caps enforced

**Audience Management:**
- ✅ Segment criteria evaluation correct
- ✅ Contact counting accurate
- ✅ Dynamic sync configuration validated
- ✅ Tag-based filtering works
- ✅ Duplicate contact handling

**Credential Management:**
- ✅ Credentials encrypted on storage
- ✅ Credentials decrypted correctly
- ✅ Invalid credentials rejected
- ✅ Credentials never logged
- ✅ Rotation supported

### Integration Tests

**Platform Providers:**
- ✅ Mailchimp: campaign creation, metrics retrieval
- ✅ HubSpot: workflow creation, contact sync
- ✅ ActiveCampaign: audience creation, automation
- ✅ SendGrid: campaign send, bounce handling
- ✅ Twilio: SMS campaign delivery

**End-to-End Workflows:**
- ✅ Create campaign → Send → Monitor metrics
- ✅ Create workflow → Trigger contact → Track progression
- ✅ A/B test → Monitor → Determine winner → Scale
- ✅ Multi-platform campaign (email + SMS)
- ✅ Audience sync across platforms

### Performance Tests

- ✅ Campaign creation latency <2s
- ✅ Metrics update latency <5s (with caching)
- ✅ Workflow execution latency <1s per step
- ✅ Support 100K+ contact audiences
- ✅ Handle 1000+ concurrent agents

---

## 12. Risks & Mitigation

| Risk | Impact | Mitigation |
| --- | --- | --- |
| **API Rate Limits** | Campaigns fail during peak load | Implement request queuing, exponential backoff, per-platform rate limiting |
| **Credential Breach** | Unauthorized access to marketing accounts | Encrypt all credentials, rotate keys, audit access logs, use OAuth when available |
| **Metrics Inconsistency** | Agent decisions based on stale data | Real-time polling with max 5s lag, cache invalidation, consistency checks |
| **Large Audience Sync** | Memory/CPU exhaustion | Pagination, batch processing, async sync, size limits |
| **Campaign Send Failures** | Customers don't receive communications | Retry logic, error notifications, fallback handling, manual escalation |
| **Data Privacy Violation** | GDPR/CCPA non-compliance | Consent checks, audit logging, data retention policies, encryption |
| **Cross-Platform Inconsistency** | Different behavior per platform | Comprehensive provider tests, API abstraction validation |

---

## 13. Future Enhancements

### Short Term (1-2 Sprints)
- [ ] Advanced segmentation UI for agents
- [ ] Campaign template library
- [ ] Automated send time optimization (per contact)
- [ ] Churn prediction and win-back campaigns
- [ ] Email deliverability scoring

### Medium Term (2-3 Sprints)
- [ ] Multi-channel attribution modeling
- [ ] Predictive analytics (next best action)
- [ ] Lookalike audience creation
- [ ] Dynamic content personalization (at scale)
- [ ] SMS/WhatsApp campaign support expansion
- [ ] Lead scoring automation
- [ ] Customer journey visualization

### Long Term (3+ Sprints)
- [ ] AI-powered subject line generation
- [ ] Automated content optimization
- [ ] Predictive send time optimization (ML)
- [ ] Advanced A/B test design (multivariate)
- [ ] Campaign performance benchmarking
- [ ] Integration with customer data platforms (CDPs)
- [ ] Real-time bidding for paid media
- [ ] Voice/podcast advertising support
- [ ] Marketing budget optimization (ML)

---

## Appendix A: Example Campaign Workflow

```typescript
// Marketing operations agent
const marketingAgent = await createAgent({
  id: 'marketing-ops-001',
  instructions: 'You are a marketing operations specialist...',
  model: 'claude-opus',
});

// 1. Create audience (high-value, engaged customers)
const audienceResponse = await marketingAgent.tool('createAudience', {
  platform: 'mailchimp',
  name: 'Q1 Launch - High Value Engaged',
  source: {
    type: 'segment',
    segment: {
      criteria: [
        { field: 'customer_ltv', operator: 'gt', value: 5000 },
        { field: 'engagement_score', operator: 'gt', value: 75 },
        { field: 'signup_date', operator: 'gt', value: '2024-01-01' }
      ],
      logic: 'AND'
    }
  }
});

const audienceId = audienceResponse.audienceId;
console.log(`Audience created: ${audienceId} (${audienceResponse.contactCount} contacts)`);

// 2. Create email campaign
const campaignResponse = await marketingAgent.tool('createMarketingCampaign', {
  platform: 'mailchimp',
  type: 'email',
  name: 'Q1 Product Launch - Premium',
  audience: { audienceId },
  content: {
    subject: 'Exclusive: New Q1 Features for Our Top Customers',
    htmlContent: `
      <h1>Welcome to Our Q1 Launch</h1>
      <p>Hi {{firstName}},</p>
      <p>As one of our valued customers, you get early access to...</p>
      <a href="https://launch.example.com?utm_campaign=q1_premium">Learn More</a>
    `,
    cta: {
      text: 'Explore New Features',
      url: 'https://launch.example.com',
      tracking: true
    },
    personalization: {
      firstName: true,
      lastName: true
    }
  },
  schedule: {
    sendType: 'optimized',
    timezone: 'America/New_York'
  },
  settings: {
    replyTo: 'support@example.com',
    trackingOptions: {
      trackOpens: true,
      trackClicks: true,
      trackConversions: true,
      conversionEvents: ['signup', 'trial_start']
    },
    abTest: {
      enabled: true,
      variants: [
        {
          id: 'variant_a',
          subject: 'Exclusive: New Q1 Features for Our Top Customers',
          weight: 50
        },
        {
          id: 'variant_b',
          subject: '🎉 Your Q1 Feature Access Is Ready (Premium Only)',
          weight: 50
        }
      ],
      winnerCriteria: 'clickRate',
      testDuration: 4,
      scaleWinner: true
    }
  }
});

const campaignId = campaignResponse.campaignId;
console.log(`Campaign created: ${campaignId}`);

// 3. Monitor campaign metrics (real-time)
const metricsInterval = setInterval(async () => {
  const metrics = await marketingAgent.tool('getCampaignMetrics', {
    campaignId,
    breakdown: 'by_segment'
  });

  console.log(`Campaign ${campaignId} Metrics:
    - Delivered: ${metrics.aggregate.contactsDelivered}/${metrics.aggregate.contactsSent}
    - Open Rate: ${metrics.aggregate.openRate}%
    - Click Rate: ${metrics.aggregate.clickRate}%
    - Conversions: ${metrics.aggregate.conversions || 0}
  `);

  // Alert if metrics diverge from targets
  if (metrics.aggregate.openRate < 15) {
    console.warn('WARNING: Open rate below target (15%)');
  }

  // A/B test results
  if (metrics.insights?.bestPerformingSegment) {
    console.log(`Best performer: ${metrics.insights.bestPerformingSegment}`);
  }
}, 300000); // Check every 5 minutes

// 4. After 24 hours, analyze results and scale winner
setTimeout(async () => {
  clearInterval(metricsInterval);

  const finalMetrics = await marketingAgent.tool('getCampaignMetrics', {
    campaignId
  });

  console.log('Campaign Complete - Final Results:');
  console.log(`  Open Rate: ${finalMetrics.aggregate.openRate}%`);
  console.log(`  Click Rate: ${finalMetrics.aggregate.clickRate}%`);
  console.log(`  Conversions: ${finalMetrics.aggregate.conversions}`);
  console.log(`  Revenue: $${finalMetrics.aggregate.revenue}`);
}, 86400000); // 24 hours
```

---

## Appendix B: Example Multi-Step Workflow (Customer Journey)

```typescript
// Customer journey automation agent
const journeyAgent = await createAgent({
  id: 'customer-journey-001',
  instructions: 'You orchestrate customer onboarding journeys...',
  model: 'claude-opus',
});

// Create multi-step onboarding workflow
const workflowResponse = await journeyAgent.tool('createMarketingWorkflow', {
  platform: 'hubspot',
  name: 'Premium Trial Onboarding Journey',
  description: 'Multi-step onboarding for trial users targeting premium conversion',

  trigger: {
    type: 'contact_added',
    criteria: {
      event: 'trial_started',
      timeWindow: 0  // immediate
    }
  },

  steps: [
    // Step 1: Welcome email
    {
      id: 'welcome_email',
      type: 'send_email',
      emailConfig: {
        templateId: 'welcome_trial_template',
        subject: 'Welcome to Your {{productName}} Trial',
        personalization: true
      }
    },

    // Step 2: Wait 1 day
    {
      id: 'wait_1day',
      type: 'wait',
      waitConfig: { duration: 86400 }
    },

    // Step 3: Check engagement (conditional)
    {
      id: 'check_engagement',
      type: 'conditional',
      conditionalConfig: {
        condition: {
          field: 'trial_sessions_count',
          operator: 'gt',
          value: 0
        },
        trueBranch: 'engaged_path',
        falseBranch: 'unengaged_path'
      }
    },

    // Step 4a: Engaged users path
    {
      id: 'engaged_path',
      type: 'send_email',
      emailConfig: {
        templateId: 'feature_highlight_template',
        subject: 'Pro Tip: 5 Ways {{firstName}} Can Get More From {{productName}}'
      }
    },

    // Step 4b: Unengaged users path (more persuasive)
    {
      id: 'unengaged_path',
      type: 'send_email',
      emailConfig: {
        templateId: 'winback_template',
        subject: '{{firstName}}, Let Me Show You What You Might Be Missing'
      }
    },

    // Step 5: Wait 2 days
    {
      id: 'wait_2days',
      type: 'wait',
      waitConfig: { duration: 172800 }
    },

    // Step 6: Check subscription status (conditional)
    {
      id: 'check_subscription',
      type: 'conditional',
      conditionalConfig: {
        condition: {
          field: 'subscription_status',
          operator: 'equals',
          value: 'active'
        },
        trueBranch: 'onboarding_complete',
        falseBranch: 'conversion_push'
      }
    },

    // Step 7a: Already subscribed - advanced features
    {
      id: 'onboarding_complete',
      type: 'send_email',
      emailConfig: {
        templateId: 'advanced_features_template',
        subject: 'Now That You\'re On Board: Advanced Features'
      }
    },

    // Step 7b: Not subscribed - final push
    {
      id: 'conversion_push',
      type: 'send_email',
      emailConfig: {
        templateId: 'final_offer_template',
        subject: '{{firstName}}, Complete Your Setup (Special Offer Inside)'
      }
    }
  ]
});

const workflowId = workflowResponse.workflowId;
console.log(`Workflow created: ${workflowId}`);
console.log(`Status: ${workflowResponse.status}`);
console.log(`Steps: ${workflowResponse.stepCount}`);

// Monitor workflow progress
setInterval(async () => {
  const workflow = await journeyAgent.tool('getMarketingWorkflow', {
    workflowId
  });

  console.log(`Workflow Progress:
    - Active Contacts: ${workflow.contactsInWorkflow}
    - Completed: ${workflow.completedContacts || 0}
    - Converted: ${workflow.convertedContacts || 0}
  `);
}, 3600000); // Check every hour
```

---

**Document Version:** 1.0
**Last Review:** 2026-03-15
**Next Review:** 2026-04-15
