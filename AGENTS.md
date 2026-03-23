# AGENTS.md

## Code Style
- Follow [CODE_STYLE.md](./CODE_STYLE.md) as the primary style guide.
- Optimize for concept, responsibility, boundary, and readable flow.
- Keep code linear and easy to follow from top to bottom.
- Prefer explicit construction and explicit start steps over hidden lazy setup.
- Prefer grouped configuration when one module owns the orchestration.
- Each file should own one main concept.
- Prefer early returns over nested conditionals.
- Avoid `any`.
- Avoid module-scope mutable state.
- Prefer `const`; use `let` only when mutation is truly part of the design.
- Avoid helper extraction unless it clearly reduces real complexity or is truly reusable.
- Avoid defensive programming in the middle of the flow. Fix the shape of the flow instead.
- Default to greenfield design. Do not add compatibility layers, repair flows, fallback behavior, or legacy-preservation logic unless the user explicitly asks for it.
- For database schema changes, always use `drizzle-kit generate` for the structural migration first. If a manual data migration is needed, put it in a separate follow-up migration and validate the full upgrade path with the real Drizzle migrator before delivery.
- Do not manually edit Drizzle structural migration SQL, `_journal.json`, or snapshot metadata. If `drizzle-kit generate` is blocked, stop and surface the issue instead of repairing Drizzle metadata by hand.
- Validate unknown input at the boundary with Zod.
- Do not leak provider-specific external ids or metadata through agent-facing tool outputs unless explicitly required.
- Keep naming literal and obvious.
