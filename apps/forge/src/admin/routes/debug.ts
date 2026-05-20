/**
 * Centralized forgeDebug re-export for admin routes.
 * All admin route files should import from here instead of directly
 * from @forge-runtime/core. This ensures consistent import paths and
 * makes it easy to swap or mock the debug logger in tests.
 *
 * @module admin/routes/debug
 */

/**
 * Centralized forgeDebug re-export for admin routes.
 * All admin route files should import from here instead of directly
 * from @forge-runtime/core. This ensures consistent import paths and
 * makes it easy to swap or mock the debug logger in tests.
 *
 * @module admin/routes/debug
 */

/* eslint-disable reexport-check/no-unnecessary-reexports */
export { forgeDebug } from '@forge-runtime/core';
/* eslint-enable reexport-check/no-unnecessary-reexports */