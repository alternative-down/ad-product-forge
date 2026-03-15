# PRD 21: CRM System

**Status:** Draft - Simplified for Solo Developer
**Date:** 2026-03-15
**Version:** 1.0
**Note:** Personal project by solo developer. Scope limited to core functionality (KISS + YAGNI).

---

## Executive Summary

### Goal
Implement a simple CRM system for agents to track customer interactions, manage sales pipeline, and maintain customer data without external dependencies.

### Core Features
1. **Customer & Contact Management** - Store customer info and contacts
2. **Sales Pipeline** - Track opportunities through sales stages
3. **Interaction History** - Log emails, calls, meetings
4. **Simple Reporting** - Basic metrics on pipeline and activity

### Out of Scope
- ML predictions
- Dashboard UI (Phase 2)
- Advanced reporting
- Third-party integrations
- Email automation

---

## Data Model

### Customers
```typescript
customers {
  id: UUID
  name: string
  email: string
  phone: string
  status: 'active' | 'inactive'
  segment: string (optional)
  created_at: timestamp
  updated_at: timestamp
}
```

### Contacts
```typescript
contacts {
  id: UUID
  customer_id: UUID (foreign key)
  name: string
  email: string
  phone: string
  role: string (optional)
  created_at: timestamp
  updated_at: timestamp
}
```

### Opportunities
```typescript
opportunities {
  id: UUID
  customer_id: UUID (foreign key)
  title: string
  value: decimal (optional)
  stage: string (prospecting | qualification | proposal | closed-won | closed-lost)
  probability: integer (0-100, optional)
  close_date: date (optional)
  created_at: timestamp
  updated_at: timestamp
}
```

### Interactions
```typescript
interactions {
  id: UUID
  customer_id: UUID (foreign key)
  type: 'email' | 'call' | 'meeting' | 'note'
  summary: string
  occurred_at: timestamp
  created_at: timestamp
}
```

---

## API Endpoints

### Customers
- `POST /api/crm/customers` — Create customer
- `GET /api/crm/customers` — List customers
- `GET /api/crm/customers/:id` — Get customer details
- `PUT /api/crm/customers/:id` — Update customer
- `DELETE /api/crm/customers/:id` — Delete customer

### Opportunities
- `POST /api/crm/opportunities` — Create opportunity
- `GET /api/crm/opportunities` — List opportunities
- `PUT /api/crm/opportunities/:id` — Update opportunity (including stage changes)
- `DELETE /api/crm/opportunities/:id` — Delete opportunity

### Interactions
- `POST /api/crm/interactions` — Log interaction
- `GET /api/crm/customers/:id/interactions` — Get customer interactions

### Pipeline
- `GET /api/crm/pipeline` — Get pipeline summary (count and value by stage)

---

## Implementation Notes

### Database
- Use existing Drizzle ORM + LibSQL setup
- Create tables: `customers`, `contacts`, `opportunities`, `interactions`
- Add simple indexes on foreign keys and frequently queried fields

### Integration
- Agent tools to create/update customers and opportunities
- Auto-log interactions from communication module (Phase 2)
- Simple REST API for future UI

### Validation
- Use Zod for schema validation
- Required fields: customer name, opportunity title, stage

### Testing
- Unit tests for core operations
- API endpoint tests
- Basic validation tests

---

## Success Criteria
- Agents can CRUD customers and opportunities
- Pipeline API returns accurate counts and values
- All data persists in database
- Simple filtering/search works

---

## Dependencies
- Drizzle ORM (existing)
- LibSQL (existing)
- Zod (existing)
- Agent context/tools framework (existing)

---

## Timeline
- **Week 1:** Database schema + migrations
- **Week 2:** API endpoints + validation
- **Week 3:** Agent tools + testing
- **Week 4:** Documentation

Total: ~40 hours for solo developer

---

**Document History:**
- v1.0 (2026-03-15): Simplified for personal solo developer project
