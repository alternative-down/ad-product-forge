# Admin Routes Module

This module contains extracted schemas and utilities from `routes.ts` to enable better testing and code organization.

## Structure

```
routes/
├── index.ts          # Re-exports all schemas and utilities
├── schemas.ts        # All Zod validation schemas
├── schemas.test.ts   # Schema unit tests
└── validation.ts     # Validation utility functions
```

## Usage

```typescript
import { agentIdQuerySchema, hireAgentSchema, parseQueryParams } from './routes/index.js';

// In route handler:
const query = parseQueryParams(agentIdQuerySchema, request.searchParams);
if (!query.success) {
  return jsonResponse({ error: query.error }, 400);
}

// Validate body:
const body = hireAgentSchema.parse(request.body);
```

## Migration Notes

- Phase 1: Extract schemas only (complete)
- Phase 2: Extract route handlers by domain (pending)
- Phase 3: Aggregate in main registerAdminRoutes (pending)

After complete extraction, `routes.ts` will import from this module and call domain-specific register functions.

## Testing

```bash
npx vitest run apps/forge/src/admin/routes/
```

## TODO

- [ ] Extract helper functions from routes.ts
- [ ] Create domain-specific route files (agent/, finance/, internal-chat/, system/)
- [ ] Add route handler tests
- [ ] Update routes.ts to use extracted modules
