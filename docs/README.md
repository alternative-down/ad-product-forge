# Documentation

This documentation set is organized by purpose instead of by historical creation order.

## Structure

- `current/`
  - Current technical documentation.
  - This is the source of truth for what is implemented today.
  - It is written against the current codebase and runtime behavior.

- `planning/`
  - Future work that still makes sense.
  - These documents describe intended directions, not implemented behavior.

- `backlog/`
  - Feature requests, ideas, and exploratory product directions.
  - These are not implementation docs.

- `references/`
  - Vision, external references, technical notes, and historical architectural context worth keeping for reasoning.

- `archive/`
  - Older planning and system documents that no longer represent the primary source of truth.
  - They are kept only for history and decision traceability.

## Rules

- If a document describes current runtime behavior, it belongs in `current/`.
- If a document describes future intent, it belongs in `planning/`.
- If a document is an idea, proposal, or product exploration, it belongs in `backlog/`.
- If a document is no longer authoritative but still useful historically, it belongs in `archive/`.

## Starting point

If the goal is to understand the current system, start here:

- [Current Overview](./current/README.md)
- [Architecture](./current/architecture.md)
- [Runtime and Lifecycle](./current/runtime-and-lifecycle.md)
- [Data Model](./current/data-model.md)
- [Integrations](./current/integrations.md)
- [Tools and Permissions](./current/tools-and-permissions.md)
- [Finance and Execution](./current/finance-and-execution.md)
- [Configuration and Endpoints](./current/configuration-and-endpoints.md)
- [Known Gaps](./current/known-gaps.md)
- [Code Map](./current/code-map.md)
