import { forgeDebug } from '@forge-runtime/core';

/**
 * Module-local debug helper for communication/provider-loader.ts.
 * Bakes in scope=provider-loader so call sites cannot typo the scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction).
 *   - 3 forgeDebug call-sites in provider-loader.ts all use scope=provider-loader
 *
 * L#NN-50 #50 LOG RETENTION discipline (codified):
 *   - Spread context fields to TOP-LEVEL of forgeDebug call, NOT nested in context
 *
 * Usage:
 *   providerLoaderDebug('error', 'loadProvider: internalChat service required');
 *   providerLoaderDebug('warn', 'Skipping Discord provider because it failed to start', { error: errorMsg(error) });
 */
export const providerLoaderDebug = (
  level: 'error' | 'warn',
  message: string,
  context?: Record<string, unknown>,
): void => {
  forgeDebug({
    scope: 'provider-loader',
    level,
    message,
    ...context,
  });
};
