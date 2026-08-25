// apps/forge/src/lib/logger.test.ts
//
// Vitest cases for the apps/forge/src/lib/logger.ts wrapper.
//
// Verifies:
// 1. The wrapper exposes the expected API (debug, info, warn, error).
// 2. Each call forwards to the runtime logger with the default 'forge-app' scope.
// 3. Optional context argument is forwarded as-is.
// 4. Calls with no context also forward correctly.
//
// Integration with @forge-runtime/core logger is tested separately in
// packages/forge-runtime-core/src/logger.test.ts.

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as runtimeCore from '@forge-runtime/core';

import { logger } from './logger.js';

describe('logger wrapper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes the expected API', () => {
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('forwards info calls to runtimeLogger with the default scope and no context', () => {
    const spy = vi.spyOn(runtimeCore.logger, 'info').mockImplementation(() => undefined);
    logger.info('HTTP server listening');
    expect(spy).toHaveBeenCalledWith('forge-app', 'HTTP server listening', undefined);
  });

  it('forwards error calls with context', () => {
    const spy = vi.spyOn(runtimeCore.logger, 'error').mockImplementation(() => undefined);
    const context = { code: 'ECONNREFUSED', port: 3011 };
    logger.error('Database connection failed', context);
    expect(spy).toHaveBeenCalledWith('forge-app', 'Database connection failed', context);
  });

  it('forwards warn calls with no context', () => {
    const spy = vi.spyOn(runtimeCore.logger, 'warn').mockImplementation(() => undefined);
    logger.warn('Admin routes served WITHOUT authentication');
    expect(spy).toHaveBeenCalledWith(
      'forge-app',
      'Admin routes served WITHOUT authentication',
      undefined,
    );
  });
});
