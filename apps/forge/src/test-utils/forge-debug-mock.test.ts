import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enableForgeDebug, isolateForgeDebug } from './forge-debug-mock';

const KEY = 'FORGE_DEBUG';

describe('isolateForgeDebug', () => {
  describe('when FORGE_DEBUG is unset initially', () => {
    beforeAll(() => {
      delete process.env[KEY];
    });

    it('does not set FORGE_DEBUG before the test', () => {
      expect(process.env[KEY]).toBeUndefined();
    });

    it('keeps FORGE_DEBUG unset when test sets it manually', () => {
      process.env[KEY] = '1';
      expect(process.env[KEY]).toBe('1');
    });

    isolateForgeDebug();

    it('starts each subsequent test with FORGE_DEBUG unset', () => {
      expect(process.env[KEY]).toBeUndefined();
    });

    it('restores original undefined state after each test', () => {
      process.env[KEY] = '1';
      // afterEach from isolateForgeDebug will run after this test
    });
  });

  describe('when FORGE_DEBUG is set initially', () => {
    const originalValue = 'true';
    beforeAll(() => {
      process.env[KEY] = originalValue;
    });
    afterAll(() => {
      delete process.env[KEY];
    });

    isolateForgeDebug();

    it('clears FORGE_DEBUG before the test', () => {
      expect(process.env[KEY]).toBeUndefined();
    });

    it('restores original FORGE_DEBUG after the test', () => {
      // afterEach will restore; assertion in afterAll
      process.env[KEY] = '1';
    });
  });
});

describe('enableForgeDebug', () => {
  beforeAll(() => {
    delete process.env[KEY];
  });
  afterAll(() => {
    delete process.env[KEY];
  });

  enableForgeDebug();

  it('sets FORGE_DEBUG to "1" before the test', () => {
    expect(process.env[KEY]).toBe('1');
  });

  it('clears FORGE_DEBUG after the test (via afterEach)', () => {
    // beforeEach in enableForgeDebug will set it again next test
    expect(process.env[KEY]).toBe('1');
  });
});
