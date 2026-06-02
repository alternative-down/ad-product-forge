/**
 * Unit tests for admin/routes/debug.ts
 *
 * The module re-exports forgeDebug from @forge-runtime/core.
 * Verifies the re-export contract: same identity, callable as a function.
 */
import { describe, expect, it, vi } from 'vitest';
import { forgeDebug as coreForgeDebug } from '@forge-runtime/core';
import { forgeDebug } from './debug';

describe('admin/routes/debug re-export', () => {
  it('re-exports forgeDebug from @forge-runtime/core', () => {
    expect(forgeDebug).toBe(coreForgeDebug);
  });

  it('export is a function', () => {
    expect(typeof forgeDebug).toBe('function');
  });

  it('export is callable without throwing', () => {
    expect(() =>
      forgeDebug({
        scope: 'admin-routes-debug-test',
        level: 'debug',
        message: 'unit-test ping',
      }),
    ).not.toThrow();
  });

  it('accepts all required fields from the canonical signature', () => {
    const sink = vi.fn();
    // forgeDebug may pipe to console or a logger; we only assert no throw.
    expect(() =>
      sink(
        forgeDebug({
          scope: 'admin-routes-debug-test',
          level: 'info',
          message: 'info-level ping',
        }),
      ),
    ).not.toThrow();
  });
});
