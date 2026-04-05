# Forge Admin Implementation Notes

## Goal
Keep the new Forge Admin codebase simple to read, easy to change, and visually consistent with the design system.

This document is about implementation structure, not only visual direction.

## Route Structure
- Use directory-based TanStack Router files only.
- Each route directory should contain:
  - `route.tsx`
  - `index.tsx`
- If a route grows large, split route-specific parts into colocated files in the same directory.

Recommended colocated split:
- `index.tsx` for route orchestration
- `*-dialog.tsx` for modal flows
- `*-table.tsx` for large tables
- `*-format.ts` for display formatting
- `*-types.ts` or `*-helpers.ts` for local route types and pure helpers

## Layout Pattern
- Global shell lives in `AppShell`.
- Global top navigation lives in `AdminTopbar`.
- Area-level submenu layout lives in `AdminAreaLayout`.
- Area routes should only define their submenu items and content.

This keeps:
- `home`
- `agents`
- `finance`
- `integrations`

on the same navigation pattern.

## Shared Admin Primitives
Use these admin wrappers when the app needs a consistent admin-specific variation:
- `AdminButton`
- `AdminInput`
- `AdminTextarea`
- `AdminDialogContent`
- `AdminDialogBody`
- `AdminDialogFooter`
- `AdminDialogHeader`
- `AdminDialogTitle`
- `AdminScrollArea`
- `AdminLoadingState`

Use generated `shadcn/ui` components directly for:
- `Dialog`
- `Select`
- `Switch`
- `Table`
- `Accordion`
- `Avatar`
- `Badge`
- `Sheet`

## Modal Pattern
- Header and footer stay outside the scroll region.
- The scrollable body should use `AdminDialogBody`.
- Do not hand-roll one-off dialog geometry in route files.
- When a modal is simple and short, it should still use the same dialog structure.

## Tables
- Prefer simple tables with:
  - `Nome`
  - specific value/date/status columns only when they add real meaning
  - `Ações` on the right when needed
- Avoid multi-line stacked table cells unless the information genuinely needs hierarchy.
- Prefer route-specific table components once a table has behavior, actions, or formatting.

## Form Pattern
- Keep forms linear.
- Put labels directly above fields.
- Use grouped two-column layouts only when they help scanning and do not harm mobile behavior.
- For list-based entities:
  - page shows listing
  - `Novo` opens modal
  - `Editar` uses the same modal

## File Size Guidance
When a file starts mixing multiple concerns, split it.

Common triggers:
- route contains table + modal + helpers + formatters
- route contains more than one form
- route contains two or more large subsections with independent behavior

Do not extract tiny helpers just to reduce line count.
Extract when a file becomes harder to scan top-to-bottom.

## Naming
- Prefer literal names.
- Route-local helpers should describe what they own:
  - `movement-dialog.tsx`
  - `movements-table.tsx`
  - `provider-credentials.ts`
- Avoid vague names like:
  - `utils.ts`
  - `helpers.ts`
unless the file is truly narrow and local to one route.

## Cleanup Rules
- Do not keep dead wrappers or dead visual system components around.
- If a wrapper is no longer used by the new admin, remove it.
- The new admin should not depend on the removed `v1`.

## Validation
Before delivery, always run:
- `npm run typecheck --workspace forge-admin`
- `npm run lint --workspace forge-admin`
- `npm run build --workspace forge-admin`
