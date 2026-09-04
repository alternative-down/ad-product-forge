import { afterEach, beforeEach } from 'vitest';

const FORGE_DEBUG_KEY = 'FORGE_DEBUG';

/**
 * Opt-in per-test forgeDebug isolation. Call once at module top-level
 * to ensure every test starts with FORGE_DEBUG unset. Original value
 * (if any) is captured before each test and restored after.
 *
 * Per L#NN-Forge-Debug-Mock-Isolation-D76 v1 N:1 EMERGING: 131 test files
 * currently mutate process.env.FORGE_DEBUG without restoration. Opt-in
 * migration avoids changing the vitest config (setupFiles is a PM stop
 * pattern).
 */
export function isolateForgeDebug(): void {
  let original: string | undefined;
  beforeEach(() => {
    original = process.env[FORGE_DEBUG_KEY];
    delete process.env[FORGE_DEBUG_KEY];
  });
  afterEach(() => {
    if (original === undefined) delete process.env[FORGE_DEBUG_KEY];
    else process.env[FORGE_DEBUG_KEY] = original;
  });
}

/** Enable forgeDebug for the entire test file, with automatic restore on teardown. */
export function enableForgeDebug(): void {
  beforeEach(() => {
    process.env[FORGE_DEBUG_KEY] = '1';
  });
  afterEach(() => {
    delete process.env[FORGE_DEBUG_KEY];
  });
}
