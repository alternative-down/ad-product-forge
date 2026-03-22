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
- Validate unknown input at the boundary with Zod.
- Do not leak provider-specific external ids or metadata through agent-facing tool outputs unless explicitly required.
- Keep naming literal and obvious.
