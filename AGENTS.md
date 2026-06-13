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

## Forge Admin Frontend

- Follow [docs/design-system/forge-admin-ui-system.md](./docs/design-system/forge-admin-ui-system.md) as the design source of truth for the new Forge Admin UI.
- Follow [docs/design-system/forge-admin-implementation.md](./docs/design-system/forge-admin-implementation.md) for route structure, shared primitives, and cleanup rules in the new Forge Admin UI.
- Avoid cards and technical explanatory text in the admin UI unless they are truly necessary for the task.
- Admin UI should be light, friendly, and clear. Avoid enterprise, industrial, and cinematic aesthetics.
- The target aesthetic is friendly minimal UI with subtle anime influence: light, human, calm, and quietly expressive.
- Keep the admin UI warm or gently neutral. Prefer soft light backgrounds, graphite text, soft borders, and restrained accents.
- Avoid hard corporate blues, heavy dark neutrals, aggressive contrast, neon, dramatic gradients, and generic enterprise dashboard styling.
- Minimal should not become sterile. Preserve warmth, softness, and a little atmosphere.
- Prefer buttons sized to their content. Do not stretch primary actions to full width unless the task clearly requires it.
- Use modals sparingly in the admin UI. Prefer them for confirmations and for add/edit flows with list-based entities. Do not move simple inline settings forms into modals.
- Admin routes must use directory-based file routing with `route.tsx` and `index.tsx` inside each route directory. Do not model routes with filename-based route modules when creating or refactoring admin routes.
- Prefer using existing `shadcn/ui` components whenever possible.
- Do not modify the generated `shadcn/ui` components in their own folder. If a variation is needed, create a separate wrapper/component and apply the variation there.

## Tripwire Standards (L#NN-13 + L#NN-26)

When creating a new L#NN-13 source-level regex tripwire (e.g., to prevent a specific bug class from regressing):

1. **Tripwire structure**: use `readFileSync` + regex, not function-level mocks. See `memory/patterns/lnn-13-tripwire-template-2026-06-12.md` for the 4-component template (N=2 verified Day 12).

2. **L#NN-26 mutation verification** (REQUIRED for new tripwires):
   - **v1 (false-negative)**: revert-fix → expect tripwire FAIL → restore → expect tripwire PASS
   - **v2 (false-positive)**: mutate-non-bug (rename, comment, whitespace) → expect tripwire PASS → restore → expect tripwire PASS
   - See `skills/lnn-26-mutation-protocol/SKILL.md` for full protocol and a meta-test at `apps/forge/src/__lnn-26-mutation-protocol.test.ts`

3. **Citation format in test header**:
   ```typescript
   /**
    * L#NN-13 tripwire for #NNNN: <one-line description>
    * L#NN-26 verification: v1 ✅, v2 ✅
    * Mutations tested: <mutation A>, <mutation B>
    */
   ```

4. **Reviewer checklist**: when reviewing a tripwire PR, verify L#NN-26 v1 + v2 (if high-stakes) are cited in the test header AND verified in the test file.

5. **When to skip v2**: simple readFileSync + equality check, low-stakes area (UI typo, comment), or P0 time pressure.

## L#NN-13 family (tripwire template)

For the tripwire template itself (regex design rules, structural vs value assertions, when to relax regex), see `memory/patterns/lnn-13-tripwire-template-2026-06-12.md`.
