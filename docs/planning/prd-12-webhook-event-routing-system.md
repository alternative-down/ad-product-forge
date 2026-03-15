# Webhook & Event Routing System

## Overview

The Webhook & Event Routing System enables external systems to trigger agent actions through HTTP webhooks. It provides agents with the ability to both create custom webhook routes and consume pre-configured webhook integrations (GitHub, Coolify, Payments, Ads, etc.). The system receives events from external sources, routes them to appropriate agents, triggers agent wakeup, and enables agents to process and respond to external triggers asynchronously.

**Key behavior:** When an external event is received via webhook, the system routes it to the designated agent(s), generates an internal message, and wakes the agent's queue to enable immediate processing. Events are queued and can be processed in batches, enabling scalable event handling without blocking webhook HTTP responses.

---

## Core Concepts

### 1. Webhook Route

A webhook route defines how external events are received and routed to agents.

**Route types:**
- **Custom routes** — created by agents for their own use cases
- **Pre-configured routes** — built-in integrations provided by the platform

**Route entity:**
```typescript
{
  routeId: string;              // UUID, unique per agent/integration
  agentId: string;              // which agent owns this route
  routeName: string;            // human-readable name (e.g., "GitHub PR events", "Payment webhooks")
  description?: string;         // optional description
  routeType: "custom" | "github" | "coolify" | "payments" | "ads" | "stripe" | "assas";
  pathPattern: string;          // URL path (e.g., "/webhook/github", "/custom/my-flow")
  secret?: string;              // optional signing secret for HMAC verification
  headers?: Record<string, string>; // headers to match/require
  eventTypes: string[];         // events to accept (e.g., ["push", "pull_request"] for GitHub)
  isActive: boolean;            // whether route accepts events
  createdAt: string;            // ISO timestamp
  updatedAt: string;            // ISO timestamp
}
```

### 2. Webhook Event

A webhook event is the HTTP payload received from an external system.

**Event entity:**
```typescript
{
  eventId: string;              // UUID, unique per event
  routeId: string;              // which route received this
  agentId: string;              // agent that owns the route
  eventType: string;            // classification (e.g., "github.push", "payment.completed")
  sourceSystem: string;         // external system name (e.g., "github", "stripe")
  sourceTimestamp?: string;     // when event occurred in source system
  receivedAt: string;           // when webhook was received
  httpStatus: number;           // HTTP response code sent to webhook source
  payload: Record<string, unknown>;  // raw event payload (stored as JSON)
  headers?: Record<string, string>;  // relevant HTTP headers
  signature?: string;           // HMAC signature for verification
  ipAddress?: string;           // source IP
  isProcessed: boolean;         // whether event was processed by agent
  processedAt?: string;         // when agent processed event
  generatedMessageId?: string;  // internal message created from event
  errorMessage?: string;        // if processing failed
}
```

### 3. Event Queue

Events are queued to decouple webhook reception from agent processing.

**Queue structure:**
- **Queue per agent** — each agent has a dedicated event queue
- **FIFO ordering** — events processed in order received
- **Batch processing** — multiple events can be processed in single agent wake
- **Persistence** — events stored in database until processed or expired

**Queue state:**
```typescript
{
  queueId: string;
  agentId: string;
  eventCount: number;           // pending events
  oldestEventAge: number;       // milliseconds since oldest event
  isProcessing: boolean;        // whether agent currently processing queue
  lastProcessedAt?: string;     // last successful batch processing
}
```

### 4. Event Routing

The system routes events from webhooks to appropriate agents based on configuration.

**Routing logic:**
```
Webhook received at /webhook/{routeId}
  ↓
Validate route exists and is active
  ├─ Verify signature if secret is set
  ├─ Check headers match expected values
  └─ Validate payload structure
       ↓
    Create webhook event record
       ↓
    Check event type against allowed types
       ├─ If allowed: queue event
       ├─ If disallowed: log and return 200 (silent rejection)
       └─ If error: return 400/500
            ↓
         Queue event in agent's event queue
            ├─ Store event in database
            ├─ Update queue counters
            └─ Trigger wake handler
                 ↓
              Wake queue receives event signal
                 ├─ Debounce multiple signals
                 ├─ Generate pending message for agent
                 └─ Wake agent to process queue
                      ↓
                   Agent wakes and processes queued events
                      ├─ Retrieves pending events from queue
                      ├─ Processes each event
                      └─ Updates event status
```

### 5. Webhook Authentication

Events from external systems are verified using cryptographic signatures.

**HMAC verification flow:**
```
Webhook payload received with X-Signature header
  ↓
Look up route secret
  ├─ If no secret: skip verification
  └─ If secret exists:
       ├─ Calculate HMAC-SHA256(payload, secret)
       ├─ Compare with X-Signature header
       ├─ If match: continue processing
       └─ If mismatch: return 401 Unauthorized
```

**Signature header format:**
```
X-Signature: sha256=<hexadecimal-digest>
```

**Example (GitHub format):**
```
X-Hub-Signature-256: sha256=<hexadecimal-digest>
```

---

## Webhook Infrastructure

Located in: `packages/mastra-engine/src/agent/webhooks/`

### HTTP Server Setup

The webhook system provides HTTP endpoints to receive events from external systems.

**Server configuration:**
```typescript
{
  host: "0.0.0.0",
  port: process.env.WEBHOOK_PORT || 3001,  // separate from main agent server
  basePath: "/webhook",                     // all routes under /webhook
  maxPayloadSize: "10mb",
  requestTimeout: 30000,  // ms to wait for webhook source
  responseTimeout: 5000,  // ms to respond with 202 Accepted
}
```

**Webhook endpoint format:**
```
POST /webhook/{routeId}
POST /webhook/github/{agentId}              // pre-configured GitHub route
POST /webhook/coolify/{agentId}             // pre-configured Coolify route
POST /webhook/payments/{agentId}            // pre-configured payment route
etc.
```

### HTTP Response Behavior

Webhook endpoints return immediately with 202 Accepted to indicate event was queued, not that it was processed.

**Response flow:**
```typescript
// Validation phase (synchronous)
if (!route || !route.isActive) return 404;
if (signature && !verifySignature(payload, secret, signature)) return 401;
if (!allowedEventTypes.includes(eventType)) return 403;

// Queue phase (synchronous, fast)
try {
  await eventStore.createEvent({eventId, routeId, payload, ...});
  await eventQueue.enqueue(agentId, eventId);
  await wakeHandler.signal(agentId);
  return 202 Accepted;  // return immediately
} catch (error) {
  return 500 Server Error;
}

// Agent processes event asynchronously (does NOT wait for this)
```

**HTTP response codes:**
- `200 OK` — Event discarded (silent rejection of disallowed type, already processed)
- `202 Accepted` — Event queued for processing
- `400 Bad Request` — Invalid payload or malformed signature
- `401 Unauthorized` — Signature verification failed
- `403 Forbidden` — Event type not allowed on this route
- `404 Not Found` — Route does not exist or is inactive
- `500 Internal Server Error` — Database or queue error

---

## Custom Webhook Routes

Agents can create their own webhook routes for custom event handling.

### Custom Route Creation

Agent-facing tools for webhook management:

```typescript
// Create a custom webhook route
createWebhookRoute(input: {
  name: string;                    // e.g., "My Form Submissions"
  description?: string;
  routeType: "custom";
  eventTypes: string[];            // types this route accepts
  enableSignature?: boolean;       // generate random secret?
}): Promise<{
  routeId: string;
  webhookUrl: string;              // full URL agent can share
  secret?: string;                 // if enableSignature: true
  createdAt: string;
}>

// Update route configuration
updateWebhookRoute(input: {
  routeId: string;
  name?: string;
  description?: string;
  eventTypes?: string[];
  isActive?: boolean;
}): Promise<{
  routeId: string;
  webhookUrl: string;
  updatedAt: string;
}>

// List all routes for this agent
listWebhookRoutes(input: {
  routeType?: "custom" | "github" | "coolify" | ...;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<Array<{
  routeId: string;
  name: string;
  routeType: string;
  webhookUrl: string;
  eventTypes: string[];
  isActive: boolean;
  createdAt: string;
}>>

// Get single route details
getWebhookRoute(routeId: string): Promise<{
  routeId: string;
  name: string;
  description?: string;
  routeType: string;
  webhookUrl: string;
  secret?: string;                 // if verification enabled
  eventTypes: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  totalEvents?: number;            // count of events received
  lastEventAt?: string;
}>

// Delete a route
deleteWebhookRoute(routeId: string): Promise<{ success: boolean }>

// Rotate signature secret
rotateWebhookSecret(routeId: string): Promise<{
  routeId: string;
  newSecret: string;
  oldSecretStillValid?: boolean;   // grace period (24 hours)
}>

// Regenerate webhook URL (invalidates old URL)
regenerateWebhookUrl(routeId: string): Promise<{
  routeId: string;
  newWebhookUrl: string;
}>

// Get recent events on a route
listWebhookEvents(input: {
  routeId: string;
  limit?: number;
  offset?: number;
  processed?: boolean;             // filter: processed/pending only
}): Promise<Array<{
  eventId: string;
  eventType: string;
  receivedAt: string;
  isProcessed: boolean;
  processedAt?: string;
  payloadPreview: string;          // truncated JSON preview
  errorMessage?: string;
}>>

// Get single event details
getWebhookEvent(eventId: string): Promise<{
  eventId: string;
  routeId: string;
  eventType: string;
  payload: Record<string, unknown>;
  headers?: Record<string, string>;
  receivedAt: string;
  isProcessed: boolean;
  processedAt?: string;
  generatedMessageId?: string;
  errorMessage?: string;
}>
```

### Event Type Convention

Custom routes can define any event type strings. Recommended convention:

```
{category}.{action}
examples:
  - "form.submission"
  - "payment.failed"
  - "user.signup"
  - "document.uploaded"
  - "integration.sync"
```

### Custom Route URL Structure

Each agent's custom webhook route has a unique, unguessable URL:

```
https://api.example.com/webhook/{routeId}
```

Where `routeId` is a UUID generated at creation time, making URLs difficult to guess.

---

## Pre-Configured Webhook Routes

Platform provides built-in webhook integrations with common services.

### GitHub Integration

Pre-configured route for GitHub events.

**Setup flow:**
```
Agent calls: enableGitHubWebhook(input: {
  orgName: string;               // GitHub organization
  authToken: string;             // GitHub API token with admin:repo_hook
  events: string[];              // ["push", "pull_request", "issues", ...]
})
  ↓
System creates webhook in GitHub organization
  ├─ Register webhook URL on GitHub
  ├─ Set payload URL to platform webhook
  ├─ Enable selected event types
  ├─ Store authToken encrypted
  └─ Create route record (routeType: "github")
       ↓
    Agent receives route details
       ├─ routeId
       ├─ webhookUrl (for reference)
       └─ eventTypes configured
```

**Supported GitHub events:**
```
push, pull_request, issues, issue_comment, pull_request_review,
pull_request_review_comment, release, create, delete, fork,
workflow_run, check_run, check_suite, status, etc.
```

**Event routing example:**
```
GitHub webhook → /webhook/github/{agentId}
  ↓
Validate signature using secret from GitHub webhook
  ↓
Extract event type from X-GitHub-Event header
  ↓
Route to agent's event queue with payload
  ↓
Agent receives message like:
"GitHub Event: push to repository
Branch: main
Commits: 3
Author: user@example.com
..."
```

**Tools:**
```typescript
enableGitHubWebhook(input: {
  orgName: string;
  authToken: string;
  events: string[];
  description?: string;
}): Promise<{
  routeId: string;
  webhookUrl: string;
}>

disableGitHubWebhook(routeId: string): Promise<{ success: boolean }>

listGitHubEvents(input: {
  routeId: string;
  limit?: number;
}): Promise<Array<...>>
```

### Coolify Integration

Pre-configured route for Coolify deployment events.

**Setup flow:**
```
Agent calls: enableCoolifyWebhook(input: {
  coolifyUrl: string;            // Coolify instance URL
  apiToken: string;              // Coolify API token
  events: string[];              // ["deployment.started", "deployment.success", ...]
})
```

**Supported Coolify events:**
```
deployment.queued, deployment.started, deployment.in_progress,
deployment.success, deployment.failed, application.crash,
resource.status_changed, etc.
```

### Payment Integration

Pre-configured routes for payment processing webhooks.

**Stripe webhook:**
```typescript
enableStripeWebhook(input: {
  stripeApiKey: string;
  events: string[];              // ["payment_intent.succeeded", "charge.failed", ...]
}): Promise<{
  routeId: string;
  webhookEndpointId: string;
}>
```

**Assas webhook:**
```typescript
enableAssasWebhook(input: {
  assasApiKey: string;
  events: string[];              // ["payment.success", "subscription.created", ...]
}): Promise<{
  routeId: string;
  webhookUrl: string;
}>
```

### Ads Integration

Pre-configured route for advertising platform events.

**Setup:**
```typescript
enableAdsWebhook(input: {
  platform: "google-ads" | "facebook-ads" | "tiktok-ads";
  accountId: string;
  accessToken: string;
  events: string[];              // ["campaign.paused", "ad.approved", ...]
}): Promise<{
  routeId: string;
}>
```

---

## Event Queue & Message Passing

Events are queued per agent and delivered via internal messaging.

### Event Queue Store

Located in: `packages/mastra-engine/src/agent/webhooks/queue-store.ts`

**Storage schema** (3 tables):

| Table | Purpose | Key Fields |
| --- | --- | --- |
| `forge_webhook_events` | Webhook events | event_id, route_id, agent_id, event_type, payload, is_processed |
| `forge_webhook_queues` | Event queues | queue_id, agent_id, pending_count, oldest_event_age |
| `forge_webhook_routes` | Webhook routes | route_id, agent_id, name, route_type, event_types, is_active |

**Event table fields:**
- `eventId` — UUID, primary key
- `routeId` — foreign key to route
- `agentId` — which agent owns this
- `eventType` — classification string
- `sourceSystem` — external system name
- `payload` — JSON payload
- `headers` — optional JSON headers
- `signature` — HMAC signature
- `ipAddress` — source IP
- `receivedAt` — ISO timestamp
- `isProcessed` — boolean
- `processedAt` — nullable ISO timestamp
- `generatedMessageId` — internal message ID
- `errorMessage` — if processing failed

### Event Processing Flow

```
Event arrives at webhook endpoint
  ↓
Create event record in forge_webhook_events
  ↓
Enqueue event to agent's queue
  ├─ Find or create queue record
  ├─ Increment pending_count
  ├─ Update oldest_event_age if first event
  └─ Mark queue as dirty (needs processing)
       ↓
    Wake queue receives signal
       ├─ Debounce (1000ms)
       ├─ Batch multiple signals
       └─ Wake agent when debounce complete
            ↓
         Agent.generate() called
            ├─ Communication module fetches pending messages
            ├─ Pending event message included in conversation
            └─ Agent processes events in context
                 ↓
              Agent can call listQueuedEvents() tool to process batch
                 ├─ Retrieves next N events
                 ├─ Marks as processing
                 └─ Agent processes each
                      ↓
                   Agent calls processWebhookEvent(eventId) for each
                      ├─ Mark as processed
                      ├─ Record processing timestamp
                      └─ Decrement queue counter
                           ↓
                        Next wake processes remaining events
```

### Agent-Facing Event Processing Tools

Located in: `packages/mastra-engine/src/agent/webhooks/tools.ts`

```typescript
// Get pending events for this agent
listQueuedEvents(input: {
  limit?: number;                // default: 10
  offset?: number;
}): Promise<Array<{
  eventId: string;
  routeId: string;
  eventType: string;
  sourceSystem: string;
  payload: Record<string, unknown>;
  receivedAt: string;
  age: number;                   // milliseconds since received
}>>

// Get single event details
getQueuedEvent(eventId: string): Promise<{
  eventId: string;
  routeId: string;
  eventType: string;
  sourceSystem: string;
  sourceTimestamp?: string;
  payload: Record<string, unknown>;
  headers?: Record<string, string>;
  receivedAt: string;
}>

// Mark event as processed
processWebhookEvent(input: {
  eventId: string;
  output?: Record<string, unknown>;  // result of processing
}): Promise<{ success: boolean }>

// Mark event as failed
failWebhookEvent(input: {
  eventId: string;
  errorMessage: string;
}): Promise<{ success: boolean }>

// Skip event
skipWebhookEvent(input: {
  eventId: string;
  reason?: string;
}): Promise<{ success: boolean }>

// Get queue status for this agent
getQueueStatus(): Promise<{
  pendingCount: number;
  oldestEventAge: number;        // milliseconds
  lastProcessedAt?: string;
  isProcessing: boolean;
}>

// Purge old events (admin only)
purgeOldEvents(input: {
  agentId: string;
  beforeDate: string;            // ISO timestamp
  keepFailed?: boolean;          // keep failed events?
}): Promise<{
  purgedCount: number;
}>
```

### Internal Message Generation

When events are queued, a pending message is created in the internal chat provider.

**Message template:**
```
External Webhook Event Received

Source System: {sourceSystem}
Event Type: {eventType}
Received: {receivedAt} (age: {humanReadableAge})
Route: {routeName}

Events Pending: {queueLength}
---

Event payload:
{prettyPrintedJson}

---
Call listQueuedEvents() to retrieve other pending events.
Call processWebhookEvent(eventId) to mark as processed.
```

**Example for GitHub push:**
```
External Webhook Event Received

Source System: github
Event Type: push
Received: 2026-03-15T10:30:45Z (age: 2 minutes)
Route: GitHub PR events

Events Pending: 3
---

Event payload:
{
  "ref": "refs/heads/main",
  "before": "abcd123",
  "after": "efgh456",
  "pusher": {
    "name": "alice",
    "email": "alice@example.com"
  },
  "repository": {
    "name": "my-app",
    "full_name": "myorg/my-app"
  },
  "commits": [
    {
      "id": "efgh456",
      "message": "Update README",
      "author": { "name": "alice", "email": "alice@example.com" }
    }
  ]
}

---
Call listQueuedEvents() to retrieve other pending events.
Call processWebhookEvent(eventId) to mark as processed.
```

---

## Webhook Router Service

Located in: `packages/mastra-engine/src/agent/webhooks/router.ts`

**Responsibilities:**
- Accept HTTP POST requests at webhook endpoints
- Validate signatures and headers
- Route events to correct agent queues
- Enqueue events and trigger wake handlers
- Return appropriate HTTP response codes
- Log all webhook activity for debugging

**Key workflow:**

```typescript
// HTTP handler for POST /webhook/:routeId
async function handleWebhook(req: Request, res: Response) {
  const { routeId } = req.params;

  // Step 1: Validate route
  const route = await routeStore.getRoute(routeId);
  if (!route || !route.isActive) {
    return res.status(404).json({ error: "Route not found" });
  }

  // Step 2: Verify signature (if required)
  if (route.secret) {
    const signature = req.headers["x-signature"];
    const valid = verifyHMAC(
      JSON.stringify(req.body),
      route.secret,
      signature
    );
    if (!valid) {
      return res.status(401).json({ error: "Invalid signature" });
    }
  }

  // Step 3: Extract event type
  const eventType = req.headers["x-event-type"] ||
                    req.body.event_type ||
                    "webhook.received";

  if (!route.eventTypes.includes(eventType)) {
    // Silent rejection
    return res.status(200).json({ received: true });
  }

  // Step 4: Create event record
  const event = await eventStore.createEvent({
    eventId: generateUUID(),
    routeId,
    agentId: route.agentId,
    eventType,
    sourceSystem: route.routeType,
    payload: req.body,
    headers: extractRelevantHeaders(req.headers),
    signature: req.headers["x-signature"],
    ipAddress: req.ip,
    receivedAt: new Date().toISOString(),
  });

  // Step 5: Queue event
  try {
    await eventQueue.enqueue(route.agentId, event.eventId);
    await wakeHandler.signal(route.agentId);

    // Return 202 immediately, processing happens async
    res.status(202).json({
      received: true,
      eventId: event.eventId,
      queueLength: await eventQueue.length(route.agentId),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to queue event" });
  }
}
```

---

## Integration with Communication Module

The webhook system integrates with the communication module to deliver events.

**Flow:**

```
Webhook event received and queued
  ↓
Event message created:
{
  type: "CommunicationInboundMessage",
  source: "webhook",
  sourceRouteId: "{routeId}",
  contactExternalId: "{sourceSystem}:{eventType}",
  contactDisplayName: "{sourceSystem} ({eventType})",
  content: "[formatted event message]",
  metadata: {
    eventId: "{eventId}",
    routeId: "{routeId}",
    eventType: "{eventType}",
    receivedAt: "{ISO timestamp}",
    payload: {...}
  },
  timestamp: [ISO timestamp]
}
  ↓
Message stored in communication database
  ↓
Wake queue triggered
  ├─ Signal received from event queue
  ├─ Debounce multiple signals (1000ms)
  └─ Wake agent when debounce completes
       ↓
    Agent wakes with pending messages
       ├─ Sees event notification
       ├─ Can call listQueuedEvents()
       └─ Can process events
```

---

## Wake Queue Integration

Webhooks trigger agent wakeup through the wake queue system.

**Webhook → Wake flow:**

```
Event queued in agent's event queue
  ↓
Wake handler receives signal
  ├─ Event: "webhook.event.queued"
  ├─ Payload: { agentId, eventCount, oldestEventAge }
  └─ Handler: wakeQueue.signal(agentId)
       ↓
    Wake queue debounces signals
       ├─ Debounce: 1000ms
       ├─ Max delay: 10000ms
       ├─ Batch multiple signals
       └─ Trigger one wake per batch
            ↓
         Agent wakes with pending event messages
```

**Configuration:**
- Debounce: 1000ms (wait up to 1s for more events)
- Max delay: 10000ms (wake no later than 10s after first event)
- Batching: Multiple events queued within debounce are processed together

---

## Configuration and Limits

### Service Configuration

```typescript
createForgeAgent({
  // ... other config ...
  webhooks: {
    enabled: true,
    httpPort: process.env.WEBHOOK_PORT || 3001,
    basePath: "/webhook",
    maxPayloadSize: "10mb",
    requestTimeout: 30000,
    responseTimeout: 5000,

    // Queue configuration
    queue: {
      maxQueueSize: 10000,        // per agent
      maxEventAge: 86400000,      // 24 hours, delete older
      batchSize: 50,              // process events in batches
    },

    // Pre-configured integrations
    integrations: {
      github: { enabled: true },
      coolify: { enabled: true },
      stripe: { enabled: true },
      assas: { enabled: true },
    },
  },
})
```

### Limits Per Agent

- Maximum 500 webhook routes per agent (custom + pre-configured combined)
- Maximum 100,000 queued events per agent (older events deleted)
- Maximum 10 MB per webhook payload
- Route name: max 255 characters
- Event type: max 50 characters
- Custom event types per route: max 100
- Webhook events retention: 90 days (configurable)
- Queue processing batch size: 50 events per wake

### Webhook Secret Requirements

- Minimum 32 characters
- Recommended: cryptographically random (generate via platform)
- Rotation supported with grace period (24 hours old secret still valid)

---

## Error Handling and Recovery

### Webhook Reception Errors

If webhook fails validation:
- Return appropriate HTTP status (400, 401, 403, 404)
- Log error with route ID and timestamp
- Do not create event record if validation fails
- Webhook source receives error immediately

```typescript
// Validation errors
if (!route) return 404;
if (!verifySignature(...)) return 401;
if (!allowedEventTypes.includes(eventType)) return 403;
if (payloadSize > maxSize) return 413;
```

### Event Queuing Failures

If event fails to queue after validation passes:
- Create event record with status "failed"
- Return 500 (retry by external system)
- Log error details
- Alert on multiple failures

```typescript
try {
  await eventStore.createEvent({...});
  await eventQueue.enqueue(agentId, eventId);
  return 202;
} catch (error) {
  logger.error(`Failed to queue event: ${error.message}`);
  return 500;
}
```

### Agent Processing Errors

If agent fails to process event:
- Mark event as failed with error message
- Do not retry automatically
- Agent can manually reprocess via API
- Logging and debugging tools available

```typescript
try {
  // Agent processes event
  await processEvent(event);
  await eventStore.updateEvent(eventId, {
    isProcessed: true,
    processedAt: new Date().toISOString(),
  });
} catch (error) {
  await eventStore.updateEvent(eventId, {
    errorMessage: error.message,
  });
}
```

### Signature Verification Errors

If signature verification fails:
- Return 401 Unauthorized
- Do not create event record
- Log failed attempt with IP address
- After 5 consecutive failures from same IP, consider blocking

### Queue Overflow

If event queue exceeds max size:
- Oldest events deleted automatically
- Alert about high event volume
- Agent should process queue more frequently
- Consider rate limiting webhook source

---

## File Structure

```
packages/
  mastra-engine/
    src/
      agent/
        webhooks/
          ├─ router.ts             ← HTTP webhook handler
          ├─ queue-store.ts        ← Event queue database
          ├─ route-store.ts        ← Webhook route database
          ├─ tools.ts              ← Agent-facing tools
          ├─ message-formatter.ts  ← Event message templates
          ├─ signature-verifier.ts ← HMAC verification
          ├─ integrations/
          │  ├─ github.ts          ← GitHub integration
          │  ├─ coolify.ts         ← Coolify integration
          │  ├─ stripe.ts          ← Stripe integration
          │  ├─ assas.ts           ← Assas integration
          │  └─ ads.ts             ← Ads platform integration
          └─ types.ts              ← Type definitions
```

---

## Out of Scope (for now)

- Webhook retries by platform (agent must handle idempotency)
- Webhook source monitoring/health checks
- Automatic webhook registration with external systems
- Event transformation/normalization pipelines
- Webhook rate limiting per source
- Webhook analytics dashboard
- Event replay functionality
- Webhook testing/simulation tools
- Conditional routing based on payload content
- Event filtering/enrichment pipeline
- Webhook endpoint discovery/registration protocol
- Dead letter queues for permanently failed events
- Event deduplication across sources
- Custom event schema validation

---

## Implementation Priority

**Phase 1 (MVP):**
1. Database schema (routes, events, queues tables)
2. Route store implementation (CRUD for routes)
3. Event store implementation (create/query events)
4. HTTP webhook router and endpoint
5. Signature verification (HMAC-SHA256)
5. Event queue implementation (enqueue/dequeue)
6. Wake queue integration
7. Agent-facing tools (create/list/delete routes, list/process events)
8. Internal message generation for events

**Phase 2:**
1. Pre-configured GitHub integration
2. Pre-configured Coolify integration
3. Event routing UI/dashboard
4. Webhook testing tools
5. Event filtering by type
6. Custom event types per route

**Phase 3:**
1. Pre-configured Stripe integration
2. Pre-configured Assas integration
3. Pre-configured Ads integration
4. Webhook secret rotation
5. Event deduplication
6. Advanced event filtering

**Phase 4:**
1. Event transformation/normalization
2. Conditional routing rules
3. Event replay functionality
4. Webhook analytics
5. Rate limiting per source
6. Dead letter queue handling
