/**
 * Typed mock factory for Database (L#18 N=11 test-pattern fix, #5633).
 *
 * Why: production code is typed as `Database` (LibSQLDatabase<typeof schema>).
 * Tests need to mock this with partial implementations. Spreading `as Database`
 * inline at every test site creates 20+ type lies. This factory is the
 * "blessed" place for the cast — call sites use the factory and stay type-clean.
 *
 * Usage:
 *   import { makeDbMock } from './test-utils/db-mock';
 *   const result = await queryRoles(makeDbMock({ agentRoles: { findMany: vi.fn()... } }));
 *
 * Pattern: factory boundary cast + partial overrides. Mirrors Drizzle's
 * `Partial<Database>` concept — overrides fill in only the methods the test
 * exercises, missing methods fall through to `undefined` and the production
 * code's `?.optionalChain` handles the absence.
 */
import type { Database } from '../../database/client';
import { vi } from 'vitest';

/**
 * Create a typed Database mock with optional overrides.
 *
 * The `as Database` cast is localized here — callers never need to cast.
 * The overrides are spread first, so production code that calls un-mocked
 * methods will fail loudly (undefined.fn()) unless the test path doesn't
 * exercise them.
 */
export function makeDbMock(overrides?: Partial<Database>): Database {
  // Localized 'as any' at the factory boundary. The test mock is partial
  // (only the methods the test exercises). Per L#NN cast priority, mocks use
  // 'as any' rather than 'as Database' to avoid TSC complaining about
  // missing fields (Database has dozens of methods the test doesn't need).
  return { ...overrides } as any;
}

/**
 * Create a vi.fn() pre-configured to return a default value.
 *
 * Replaces the pattern `vi.fn().mockResolvedValue(defaultValue)` with a
 * one-liner that carries the generic type.
 */
export function makeQueryMock<T>(defaultValue: T) {
  return vi.fn().mockResolvedValue(defaultValue);
}
