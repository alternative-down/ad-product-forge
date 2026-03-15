# PRD 23: Project & Task Management

**Status:** Draft - Simplified for Solo Developer
**Date:** 2026-03-15
**Version:** 1.0
**Note:** Personal project by solo developer. Scope limited to core functionality (KISS + YAGNI).

---

## Executive Summary

### Goal
Implement a simple task management system for organizing work into projects with status tracking, without complex dependencies, hierarchies, or collaboration features.

### Core Features
1. **Projects** - Create and organize work into projects
2. **Tasks** - Create tasks within projects with basic status
3. **Status Tracking** - Track task progress (to-do, in-progress, done)
4. **Simple Listing** - View tasks filtered by project or status

### Out of Scope
- Task dependencies
- Subtasks/hierarchies
- Assignments/team features
- Comments/discussions
- File attachments
- Notifications
- Activity feeds
- Advanced filtering
- Dashboards

---

## Data Model

### Projects
```typescript
projects {
  id: UUID
  name: string
  description: string (optional)
  status: 'active' | 'archived'
  created_at: timestamp
  updated_at: timestamp
}
```

### Tasks
```typescript
tasks {
  id: UUID
  project_id: UUID (foreign key)
  title: string
  description: string (optional)
  status: 'to-do' | 'in-progress' | 'done'
  priority: 'low' | 'medium' | 'high' (optional)
  due_date: date (optional)
  created_at: timestamp
  updated_at: timestamp
}
```

---

## API Endpoints

### Projects
- `POST /api/projects` — Create project
- `GET /api/projects` — List projects
- `GET /api/projects/:id` — Get project details
- `PUT /api/projects/:id` — Update project
- `DELETE /api/projects/:id` — Delete project

### Tasks
- `POST /api/projects/:project_id/tasks` — Create task
- `GET /api/projects/:project_id/tasks` — List project tasks
- `GET /api/tasks/:id` — Get task details
- `PUT /api/tasks/:id` — Update task (including status changes)
- `DELETE /api/tasks/:id` — Delete task

### Filtering
- `GET /api/tasks?status=in-progress` — List tasks by status
- `GET /api/tasks?project_id=X` — List tasks by project

---

## Implementation Notes

### Database
- Use existing Drizzle ORM + LibSQL
- Create tables: `projects`, `tasks`
- Index on project_id for fast task queries
- Index on status for filtering

### API Design
- Simple REST endpoints, no GraphQL
- All field updates done via PUT (no PATCH)
- Soft deletes optional (permanent delete is fine for simplicity)

### Validation
- Use Zod for schema validation
- Required: project name, task title
- Valid statuses enforced at API level

### Testing
- Unit tests for CRUD operations
- API endpoint tests
- Status transition tests

---

## Success Criteria
- Projects can be created, listed, updated, deleted
- Tasks can be created and moved between statuses
- Filtering by project and status works
- Data persists correctly

---

## Dependencies
- Drizzle ORM (existing)
- LibSQL (existing)
- Zod (existing)

---

## Timeline
- **Week 1:** Database schema + migrations
- **Week 2:** Project endpoints
- **Week 3:** Task endpoints + filtering
- **Week 4:** Testing + documentation

Total: ~30 hours for solo developer

---

**Document History:**
- v1.0 (2026-03-15): Simplified for personal solo developer project
