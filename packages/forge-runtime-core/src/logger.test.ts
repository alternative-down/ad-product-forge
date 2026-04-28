import { describe, expect, it } from 'vitest';

describe('LogLevel', () => {
  it('has correct ordinal values', async () => {
    const { LogLevel } = await import('./logger.js');
    expect(LogLevel.DEBUG).toBe(0);
    expect(LogLevel.INFO).toBe(1);
    expect(LogLevel.WARN).toBe(2);
    expect(LogLevel.ERROR).toBe(3);
  });

  it('values are ordered from lowest to highest severity', async () => {
    const { LogLevel } = await import('./logger.js');
    expect(LogLevel.DEBUG).toBeLessThan(LogLevel.INFO);
    expect(LogLevel.INFO).toBeLessThan(LogLevel.WARN);
    expect(LogLevel.WARN).toBeLessThan(LogLevel.ERROR);
  });
});

describe('logger output structure', () => {
  it('LogLevel enum has expected keys', async () => {
    const { LogLevel } = await import('./logger.js');
    const keys = Object.keys(LogLevel).filter((k) => isNaN(Number(k)));
    expect(keys).toEqual(['DEBUG', 'INFO', 'WARN', 'ERROR']);
  });

  it('logger object has expected methods', async () => {
    const { logger } = await import('./logger.js');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });
});
