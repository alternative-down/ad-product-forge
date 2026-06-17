/**
 * find-or-throw.ts
 *
 * Helper for the "findFirst + check undefined + log + throw" pattern.
 *
 * Issue #5469: this pattern is repeated 40+ times across 20+ files with
 * subtle drift (some calls include forgeDebug before throw, others don't).
 * This helper standardizes the shape and prevents the drift.
 *
 * ─── Canonical pattern ──────────────────────────────────────────────────
 *
 * Before (12 LoC):
 *
 *   const x = await db.query.<table>.findFirst({
 *     where: eq(<table>.id, input.X),
 *   });
 *   if (x === undefined) {
 *     forgeDebug({
 *       scope: '<scope>',
 *       level: 'warn',
 *       message: '<Op>: <entity> not found',
 *       context: { <idField>: input.X },
 *     });
 *     throw new Error(`<entity> not found: ${input.X}`);
 *   }
 *
 * After (1 line):
 *
 *   const x = await findOrThrow(
 *     db.query.<table>,
 *     { scope: '<scope>', entity: '<entity>', op: '<Op>', idValue: input.X },
 *     { where: eq(<table>.id, input.X) },
 *   );
 *
 * ─── Why this matters ──────────────────────────────────────────────────
 *
 * - **Consistency**: every "not found" case is logged via forgeDebug with
 *   the same shape. The previous drift (some sites skipped forgeDebug) is
 *   impossible with the helper.
 * - **LoC reduction**: ~12 LoC per site becomes 1 line. For 6 sites in
 *   capabilities/runtime.ts alone, that's ~70 LoC reduction.
 * - **Observability**: every missing entity now appears in the log stream,
 *   making on-call debugging easier.
 *
 * ─── Related ───────────────────────────────────────────────────────────
 *
 * - #5455: withDbErrorLogging (different pattern — try/catch around db ops)
 * - #5468: generalize withDbErrorLogging to all 7 store files
 * - #5469: this helper
 */

import { forgeDebug } from '@forge-runtime/core';

/**
 * A Drizzle query builder that supports findFirst. Pass `db.query.<table>`
 * (the typed query builder from drizzle-orm's relational query API).
 */
export interface FindFirstQueryable {
  findFirst: (args?: { where?: unknown }) => Promise<unknown>;
}

/**
 * Logger context for the "not found" event.
 */
export interface FindOrThrowLogger {
  /** forgeDebug scope (e.g. 'capabilities-runtime') */
  scope: string;
  /** Entity name for the error message (e.g. 'agent', 'agentRole') */
  entity: string;
  /** Operation name for the log message (e.g. 'changeAgentRole') */
  op: string;
  /** The id value being looked up (used in the log context + error message) */
  idValue: string;
  /**
   * Custom context field name for the id value. Defaults to 'id'.
   * Use this when the entity uses a non-default id field (e.g. 'agentId',
   * 'roleId') to align with the rest of the codebase's context shape.
   */
  idField?: string;
}

/**
 * Find a row by a where clause, throw a typed error if not found.
 *
 * @param queryable - Drizzle query builder for the table (e.g. db.query.agents)
 * @param logger - Logger context (scope, entity, op, idValue, optional idField)
 * @param findArgs - findFirst arguments (where clause + any other drizzle options)
 * @returns The row (guaranteed non-null)
 * @throws Error with message `<entity> not found: <idValue>`
 *
 * @example
 *   const actorAgent = await findOrThrow(
 *     db.query.agents,
 *     { scope: 'capabilities-runtime', entity: 'actor agent', op: 'changeAgentRole', idValue: input.actorAgentId },
 *     { where: eq(agents.id, input.actorAgentId) },
 *   );
 */
export async function findOrThrow<T>(
  queryable: { findFirst: (args?: any) => Promise<T | undefined | null> },
  logger: FindOrThrowLogger,
  findArgs?: any,
): Promise<T> {
  const row = await queryable.findFirst(findArgs);

  if (row === undefined || row === null) {
    const idField = logger.idField ?? 'id';
    forgeDebug({
      scope: logger.scope,
      level: 'warn',
      message: `${logger.op}: ${logger.entity} not found`,
      context: { [idField]: logger.idValue },
    });
    throw new Error(`${logger.entity} not found: ${logger.idValue}`);
  }

  return row;
}