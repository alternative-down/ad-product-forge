/**
 * Typed Error subclasses for the database/migrate module
 * (Pattern L, D52 #6502 batch 39).
 */
export class MigrationsJournalNotFoundError extends Error {
  readonly code = 'MIGRATIONS_JOURNAL_NOT_FOUND' as const;
  readonly start: string;
  constructor(start: string) {
    super(`migrations/meta/_journal.json not found above ${start} (walked 5 levels)`);
    this.name = 'MigrationsJournalNotFoundError';
    this.start = start;
  }
}
