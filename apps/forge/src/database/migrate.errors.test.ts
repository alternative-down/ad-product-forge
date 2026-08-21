import { describe, expect, it } from 'vitest';
import { MigrationsJournalNotFoundError } from './migrate.errors';

describe('MigrationsJournalNotFoundError', () => {
  it('preserves verbatim message format', () => {
    const err = new MigrationsJournalNotFoundError('/app/src');
    expect(err).toBeInstanceOf(MigrationsJournalNotFoundError);
    expect(err.name).toBe('MigrationsJournalNotFoundError');
    expect(err.code).toBe('MIGRATIONS_JOURNAL_NOT_FOUND');
    expect(err.start).toBe('/app/src');
    expect(err.message).toBe('migrations/meta/_journal.json not found above /app/src (walked 5 levels)');
  });
});
