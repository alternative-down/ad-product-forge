# PRD-12: Webhook & Event Routing System

**Status:** Planning

**Note:** This is a personal project from a solo developer. Built with KISS (Keep It Simple, Stupid) and YAGNI (You Aren't Gonna Need It) principles in mind.

## Overview

Simple webhook endpoint for external systems to trigger agent actions. Agents receive webhook events via internal messages.

**Core behavior:** HTTP POST → validate signature → queue event → wake agent → agent processes event.

---

## Core Concepts

### 1. Webhook Route

An HTTP endpoint that receives events from external systems.

```typescript
{
  routeId: string;              // UUID
  agentId: string;              // Agent that owns this route
  pathPattern: string;          // URL path (e.g., "/webhook/my-route")
  secret?: string;              // HMAC secret for signature verification
  isActive: boolean;            // Accept events?
  createdAt: string;
}
```

### 2. Webhook Event

Raw HTTP payload received from external system.

```typescript
{
  eventId: string;              // UUID
  routeId: string;              // Which route received this
  agentId: string;              // Agent that owns the route
  payload: Record<string, unknown>;  // Raw JSON payload
  receivedAt: string;           // When received
  isProcessed: boolean;         // Agent processed it?
}
```

### 3. Event Queue

Events queued per agent, processed FIFO.

```typescript
{
  queueId: string;
  agentId: string;
  eventCount: number;    // pending events
}
```

### 4. Event Routing

Simple flow:
1. HTTP POST to `/webhook/{routeId}`
2. Verify signature if secret configured
3. Create event record
4. Queue event → wake agent
5. Return 202 Accepted immediately
6. Agent processes later

---

## Implementation

### HTTP Server

Simple HTTP server that accepts POST requests:
- Port: 3001 (configurable via env var)
- Base path: `/webhook`
- Endpoint: `POST /webhook/{routeId}`

### Response Codes

- `202 Accepted` — Event queued
- `400 Bad Request` — Invalid payload
- `401 Unauthorized` — Signature verification failed
- `404 Not Found` — Route doesn't exist
- `500 Internal Server Error` — Database error

---

## Agent Tools

Simple tools for agents to work with webhooks:

```typescript
// Create a webhook route
createWebhookRoute(input: {
  name: string;
}): Promise<{
  routeId: string;
  webhookUrl: string;
  secret: string;
}>

// List webhook events for this agent
listQueuedEvents(): Promise<Array<{
  eventId: string;
  payload: Record<string, unknown>;
  receivedAt: string;
}>>

// Mark event as processed
processWebhookEvent(eventId: string): Promise<{ success: boolean }>

// Delete a webhook route
deleteWebhookRoute(routeId: string): Promise<{ success: boolean }>
```

---

## Storage

3 simple tables:

- `webhook_routes` — route_id, agent_id, path_pattern, secret
- `webhook_events` — event_id, route_id, agent_id, payload, received_at, is_processed
- `webhook_queues` — queue_id, agent_id, event_count

---

## Timeline

- **Week 1**: HTTP server + route/event storage
- **Week 2**: Event queue + wake integration
- **Week 3**: Agent tools + tests
