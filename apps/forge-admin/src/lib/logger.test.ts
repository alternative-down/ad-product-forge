// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from './logger';

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prepends the [forge-admin] prefix to every level', () => {
    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    expect(console.debug).toHaveBeenCalledWith('[forge-admin]', 'debug message');
    expect(console.info).toHaveBeenCalledWith('[forge-admin]', 'info message');
    expect(console.warn).toHaveBeenCalledWith('[forge-admin]', 'warn message');
    expect(console.error).toHaveBeenCalledWith('[forge-admin]', 'error message');
  });

  it('forwards additional args unchanged (objects, errors, etc.)', () => {
    const error = new Error('boom');
    const metadata = { requestId: 'req-1', userId: 'u-1' };

    logger.error('request failed', error, metadata);

    expect(console.error).toHaveBeenCalledWith(
      '[forge-admin]',
      'request failed',
      error,
      metadata,
    );
  });

  it('does not introduce extra wrapping when no additional args are passed', () => {
    logger.warn('simple warning');

    expect(console.warn).toHaveBeenCalledTimes(1);
    const callArgs = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs).toHaveLength(2);
    expect(callArgs[0]).toBe('[forge-admin]');
    expect(callArgs[1]).toBe('simple warning');
  });
});
