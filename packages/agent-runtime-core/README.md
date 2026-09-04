# agent-runtime-core

`agent-runtime-core` is the reusable, product-neutral runtime used to build persistent step-based agents.

## Scope

The package owns:

- runtime input and output contracts;
- context assembly and model invocation;
- typed action registration and execution;
- continuation and step control;
- lifecycle events and observers;
- optional integrations for persistence, retrieval, media, browser, workspace, scheduling, and provider access.

Product concepts such as company roles, administrative APIs, billing, Discord accounts, and Forge-specific workflows remain outside this package.

## Entrypoints

- `agent-runtime-core`: core runtime contracts and execution.
- `agent-runtime-core/integrations`: adapters, gateways, persistence, memory, retrieval, and host utilities.
- `agent-runtime-core/examples`: reference compositions used to exercise the public abstractions.

## Development

```bash
npm run -w agent-runtime-core build
npm run -w agent-runtime-core typecheck
npm run -w agent-runtime-core test
```

Public exports are defined by the package manifest and source entrypoints. Tests live beside the behavior they verify.
