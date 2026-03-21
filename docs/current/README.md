# Current System

This directory documents the current state of the Forge application as implemented in code.

These documents replace older PRDs that mixed implemented behavior with future intent.

## Documents

- [Architecture](./architecture.md)
  - Process structure, main modules, startup sequence, and system boundaries.

- [Runtime and Lifecycle](./runtime-and-lifecycle.md)
  - Agent loading, hiring, termination, wake sources, scheduling, and execution loop behavior.

- [Data Model](./data-model.md)
  - Central database tables and what they mean.

- [Integrations](./integrations.md)
  - Communication, GitHub, Migadu email, and Coolify.

- [Tools and Permissions](./tools-and-permissions.md)
  - Agent-facing tool surface, role/function control, and workflow permissions.

- [Finance and Execution](./finance-and-execution.md)
  - Contracts, spend tracking, cash ledger, and micro ERP read models.

- [Configuration and Endpoints](./configuration-and-endpoints.md)
  - Environment variables, HTTP server boundary, and current route surface.

- [Admin Console](./admin-console.md)
  - Separate maintenance UI, backend admin endpoints, and current UI boundary.

- [Known Gaps](./known-gaps.md)
  - Major capabilities still missing from the current implementation.

- [Code Map](./code-map.md)
  - Practical map of where each current responsibility lives in the codebase.
