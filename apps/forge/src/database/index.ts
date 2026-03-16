/**
 * Exports do módulo de database - APP
 */

export { getDatabase, schema } from './client.js';
export { getAppDatabasePath } from './config.js';
export { runMigrations } from './migrate.js';
export * from './schema.js';
export type { Database } from './client.js';
