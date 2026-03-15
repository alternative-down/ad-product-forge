# PRD 24: Ticketing System

**Status:** Draft - Simplified for Solo Developer
**Date:** 2026-03-15
**Version:** 1.0
**Note:** Personal project by solo developer. Scope limited to core functionality (KISS + YAGNI).

---

## Executive Summary

### Goal
Implement a basic ticketing system for tracking and resolving support issues, with simple routing and status tracking.

### Core Features
1. **Ticket Creation** - Users/agents can create tickets
2. **Status Tracking** - Track ticket progress (open, in-progress, closed)
3. **Priority Levels** - Simple priority assignment
4. **Comments** - Add notes/updates to tickets
5. **Basic Routing** - Assign to agent or category

### Out of Scope
- Intelligent routing/SLA tracking
- Multi-provider integration (Discord, Email, etc.)
- Automation/workflows
- Custom fields
- Time tracking
- Knowledge base integration
- Customer portal
- Advanced reporting

---

## Data Model

### Tickets
```typescript
tickets {
  id: UUID
  title: string
  description: string
  status: 'open' | 'in-progress' | 'closed'
  priority: 'low' | 'medium' | 'high'
  category: string (optional)
  assigned_to: string (agent_id, optional)
  created_by: string (customer_id or agent_id)
  created_at: timestamp
  updated_at: timestamp
  closed_at: timestamp (optional)
}
```

### Ticket Comments
```typescript
ticket_comments {
  id: UUID
  ticket_id: UUID (foreign key)
  author_id: string
  comment: string
  created_at: timestamp
}
```

---

## API Endpoints

### Tickets
- `POST /api/tickets` — Create ticket
- `GET /api/tickets` — List tickets (with status/priority filters)
- `GET /api/tickets/:id` — Get ticket details
- `PUT /api/tickets/:id` — Update ticket (status, priority, assignee)
- `DELETE /api/tickets/:id` — Delete ticket (optional)

### Ticket Comments
- `POST /api/tickets/:id/comments` — Add comment
- `GET /api/tickets/:id/comments` — Get ticket comments

### Filtering
- `GET /api/tickets?status=open` — Filter by status
- `GET /api/tickets?assigned_to=agent_id` — Filter by assignee
- `GET /api/tickets?priority=high` — Filter by priority

---

## Implementation Notes

### Database
- Use existing Drizzle ORM + LibSQL
- Create tables: `tickets`, `ticket_comments`
- Index on status, assigned_to, created_at

### API Design
- Simple REST endpoints
- All updates via PUT
- Comments are immutable (no delete/edit)

### Validation
- Use Zod for schema validation
- Required: title, description, status
- Valid statuses: open, in-progress, closed

### Simple Routing
- Manual assignment via API (no intelligent routing)
- Optional category field for future use

### Testing
- CRUD tests for tickets and comments
- API endpoint tests
- Filter tests

---

## Success Criteria
- Tickets can be created, listed, updated, closed
- Comments can be added and retrieved
- Filtering by status, priority, assignee works
- All data persists correctly

---

## Dependencies
- Drizzle ORM (existing)
- LibSQL (existing)
- Zod (existing)

---

## Timeline
- **Week 1:** Database schema + migrations
- **Week 2:** Ticket endpoints
- **Week 3:** Comments + filtering
- **Week 4:** Testing + documentation

Total: ~30 hours for solo developer

---

**Document History:**
- v1.0 (2026-03-15): Simplified for personal solo developer project
