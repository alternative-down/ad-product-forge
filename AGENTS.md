# AGENTS.md

## Code Style
- Each file should own one main concept or responsibility.
- Prefer linear code that reads top to bottom.
- Prefer early returns over nested conditionals.
- Avoid module-scope mutable state.
- Avoid defensive programming in the middle of the flow. Validate at the boundary.
- Prefer Zod at boundaries instead of type normalization scattered through the code.
- Avoid `any`.
- Avoid helper functions unless they are clearly reusable or reduce real complexity.
- Use closures and factories sparingly. Prefer direct code when it stays clear.
- Keep naming literal and obvious.
