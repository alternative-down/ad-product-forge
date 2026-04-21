# Module Layout

## Purpose

This document proposes how the repository should be physically organized so that the architecture remains visible in the codebase.

The exact structure may evolve, but the design principles behind it should remain stable.

## Initial Constraint

The repository should not start as a giant monorepo with many packages before the concepts are proven.

However, the documentation should already reflect which parts are:

- core
- optional
- adapter-specific
- application-specific

This prevents the source tree from silently becoming architecture.

## Current Layout

The repository now uses a layered source tree instead of a flat `src/`.

Current shape:

- `src/core/`
  - the non-opinionated runtime base
  - runtime loop, contracts, strategies, context helpers, observers, plugins
- `src/integrations/`
  - the broader DX and capability layer above the core
  - adapters, gateways, runtime bridges, memory, retrieval, persistence, scheduler, usage, and testing helpers
- `src/examples/`
  - reference compositions that pressure-test the framework
- `src/scripts/`
  - validation and smoke scripts
- `src/test/`
  - the package test suite, kept out of the root source surface

This keeps the package as one repository and one distributable library while making the intended architectural direction visible in the tree.

Within `src/integrations/`, the layout is further split by responsibility:

- `adapters/`
- `assets/`
- `dispatch/`
- `embedding/`
- `extensions/`
- `gateways/`
- `hosts/`
- `journal/`
- `memory/`
- `persistence/`
- `providers/`
- `retrieval/`
- `runtime/`
- `scheduler/`
- `skills/`
- `state/`
- `testing/`
- `usage/`

This is the current near-term layout and should be treated as the baseline unless a later package split becomes justified.

## Possible Future Multi-Package Layout

Once the implementation stabilizes, the repository may expand into separate packages.

Likely package families:

### `packages/core`

This should contain the domain-agnostic runtime center:

- step execution
- context assembly contracts
- action contracts
- extension contracts
- base runtime types

### `packages/model-ai-sdk`

This should contain the adapter between the runtime model contract and `ai-sdk`.

This separation matters because the core should not depend directly on one model SDK forever, even if `ai-sdk` is the initial path.

### `packages/extensions-*`

These are optional capability packages.

Examples:

- `extensions-recent-memory`
- `extensions-checkpoint-memory`
- `extensions-document-recall`
- `extensions-autonomy`
- `extensions-telemetry`

### `packages/storage-*`

These are optional infrastructure packages.

Examples:

- `storage-filesystem`
- `storage-sqlite`
- `storage-libsql`
- `storage-inmemory`

Storage packages should serve extension packages, not define the runtime center.

### `examples/*`

Examples are strategically important.

They prove that the core is really generic rather than merely abstract in theory.

Important example candidates:

- minimal step runtime
- simple memoryful assistant
- village NPC
- VTuber shell
- world-creator shell

## Why Examples Matter

Without examples, it is easy to build an architecture that sounds general but is awkward in real use.

Examples reveal:

- whether the core is too opinionated
- whether the extension model is too weak
- whether the abstractions are too abstract
- whether important concepts are missing

Examples should therefore be treated as architectural tests, not documentation garnish.

## Boundaries To Protect In The File Tree

Regardless of final packaging, some boundaries should remain explicit.

### Runtime Versus Extensions

The runtime should not casually import extension implementations.

If that happens, extension logic has already leaked into the center.

### Core Versus Storage

The core should never depend directly on concrete storage implementations.

### Core Versus Domain Adapters

Game, browser, chat, TTS, and similar domain surfaces should remain outside the runtime center.

### Types Versus Helpers

The codebase should avoid a sprawl of helper modules that become hidden architecture.

Where possible:

- keep concepts explicit
- keep code linear
- create helpers only when they truly reduce complexity

## Repository Evolution Strategy

The repository should evolve in this order:

1. documentation-defined architecture
2. minimal runtime implementation
3. clean internal module boundaries
4. proof through examples and integrations
5. extraction into multi-package form only when justified

This order matters.

If packaging happens too early, the repository may spend energy on package ceremony before the concepts are correct.
If packaging happens too late, accidental coupling becomes harder to undo.

The right moment is after the first clean runtime slice and first real examples.
