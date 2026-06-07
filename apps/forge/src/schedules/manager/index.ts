/**
 * Public API of the manager subsystem.
 *
 * Re-exports from 4 sub-modules: manager (SUT), store (DB CRUD),
 * normalize (input handling), auth (authorization checks).
 *
 * The file-level eslint-disable is intentional: this is a barrel
 * aggregating 4 domain modules. Consumers use named imports.
 *
 * Tripwire: see `manager/index.test.ts` which asserts that the barrel
 * surface matches the union of the 4 sub-modules' exports. See #5611.
 */
/* eslint-disable reexport-check/no-unnecessary-reexports */
export * from './manager';
export * from './store';
export * from './normalize';
export * from './auth';
