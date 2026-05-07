/**
 * Exports do módulo de database - APP
 */

// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- stable public API surface
export { getDatabase } from './client';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- stable public API surface
export { runMigrations } from './migrate';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- stable public API surface
export * from './schema';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- type-only public API surface
export type { Database } from './client';
