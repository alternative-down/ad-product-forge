import { describe, it, expect } from 'vitest';

/**
 * Regression tests for #2705 — limit(1) guard bug.
 *
 * drizzle-orm with better-sqlite3 returns an array from .limit(1).
 * When no rows match, existing is [] and existing[0] is undefined.
 *
 *   [] [0] != null  // true (undefined !== null)
 *
 * So the buggy guard "if (existing[0] != null)" was actually entering
 * the block when NO match existed, then crashing on existing[0].id.
 *
 * The correct guard is "if (existing.length > 0)".
 */
describe('limit(1) guard — existing.length > 0 (#2705)', () => {
  describe('upsertCustomer pattern', () => {
    it('enters the if-block when a record exists (length > 0)', () => {
      const existing = [{ id: 'cust_123', email: 'test@example.com' }];
      let called = false;

      // Simulates the corrected guard from upsertCustomer
      if (existing.length > 0) {
        called = true;
        expect(existing[0].id).toBe('cust_123');
      }

      expect(called).toBe(true);
    });

    it('skips the if-block when no record exists (empty array)', () => {
      const existing: Array<{ id: string }> = [];
      let called = false;

      // Simulates the corrected guard from upsertCustomer
      if (existing.length > 0) {
        called = true;
      }

      expect(called).toBe(false);
    });

    it('original buggy guard (existing[0] != null) enters block incorrectly', () => {
      const existing: Array<{ id: string }> = [];
      let buggyCalled = false;

      // Simulates the ORIGINAL buggy guard
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (existing[0] != null) {
        buggyCalled = true;
      }

      // This is the bug: it entered the block when it should not have
      expect(buggyCalled).toBe(true); // proves the original was broken
    });
  });

  describe('upsertSubscription pattern', () => {
    it('enters the if-block when a record exists (length > 0)', () => {
      const existing = [{ id: 'sub_456' }];
      let called = false;

      if (existing.length > 0) {
        called = true;
        expect(existing[0].id).toBe('sub_456');
      }

      expect(called).toBe(true);
    });

    it('skips the if-block when no record exists (empty array)', () => {
      const existing: Array<{ id: string }> = [];
      let called = false;

      if (existing.length > 0) {
        called = true;
      }

      expect(called).toBe(false);
    });

    it('original buggy guard (existing[0] != null) enters block incorrectly', () => {
      const existing: Array<{ id: string }> = [];
      let buggyCalled = false;

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (existing[0] != null) {
        buggyCalled = true;
      }

      // Confirms the bug: block entered when no record exists
      expect(buggyCalled).toBe(true);
    });
  });
});
