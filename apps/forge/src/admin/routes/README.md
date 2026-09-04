# Admin routes

This directory owns the Forge administrative HTTP routes.

Routes are grouped by domain. Boundary input is parsed with Zod before reaching application services, and provider-specific data should not leak through agent-facing responses.

Run the focused route tests with:

```bash
npm exec vitest run -- apps/forge/src/admin/routes
```
