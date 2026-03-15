# PRD 24: Ticketing System

**Status:** Draft - Simplified for Solo Developer
**Date:** 2026-03-15
**Version:** 1.0
**Note:** Personal project by solo developer. Scope limited to core functionality (KISS + YAGNI).

---

## Executive Summary

### Classification: AD-PRODUCT-FORGE APPLICATION

**This PRD describes customer support infrastructure specific to ad-product-forge.** Ticketing system enables Nicolas' support agents to track and resolve customer issues. This is application-specific, not framework infrastructure.

### Goal
Implement a basic ticketing system for tracking and resolving support issues, with simple routing and status tracking.

### Core Features
1. **Ticket Creation** - Create support tickets
2. **Status Tracking** - Track ticket progress (open, closed)
3. **Simple Listing** - View all tickets

### Out of Scope
- Routing and assignment
- Comments/notes
- Priority levels
- Multi-provider integration
- Automation/workflows
- Time tracking
- SLA tracking
- Customer portal

---

## Data Model

### Tickets
```typescript
tickets {
  id: UUID
  title: string
  description: string
  status: 'open' | 'closed'
  created_by: string (creator_id)
  created_at: timestamp
  updated_at: timestamp
}
```

---

## API Endpoints

### Tickets
- `POST /api/tickets` — Create ticket
- `GET /api/tickets` — List tickets
- `GET /api/tickets/:id` — Get ticket details
- `PUT /api/tickets/:id` — Update ticket (status)
- `DELETE /api/tickets/:id` — Delete ticket

### Filtering
- `GET /api/tickets?status=open` — Filter by status
- `GET /api/tickets?created_by=creator_id` — Filter by creator

---

## Implementation Notes

### Database
- Use existing Drizzle ORM + LibSQL
- Create tables: `tickets`
- Index on status and created_at

### API Design
- Simple REST endpoints
- All updates via PUT

### Validation
- Use Zod for schema validation
- Required: title, description
- Valid statuses: open, closed

### Testing
- CRUD tests for tickets
- API endpoint tests
- Status filter tests

---

## Success Criteria
- Tickets can be created, listed, updated, and closed
- Filtering by status works
- All data persists correctly

---

## Dependencies
- Drizzle ORM (existing)
- LibSQL (existing)
- Zod (existing)

---

## Timeline
- **Week 1:** Database schema + all endpoints
- **Week 2:** Testing + documentation

Total: ~15 hours for solo developer

---

**Document History:**
- v1.0 (2026-03-15): Simplified for personal solo developer project
