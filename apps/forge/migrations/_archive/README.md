# Migrations Archive

This directory holds migration files that are no longer intended to be
applied. Files here are **outside the drizzle-orm migrator's scan path**
(the migrator only reads from the `migrations/` root, not subdirectories),
so they are inert from an automated-migration perspective.

## Files

### `0024_lazy_zaran.sql` (moved 2026-06-02, issue #5346)

Originally placed in `apps/forge/migrations/0024_lazy_zaran.sql` by
kaelen-xhhzsg in commit `1357e59cc` (2026-05-07, PR #1770 / fix #1540).
The file was meant to be the `ALTER TABLE ADD COLUMN` migration companion
to a schema change that added the `is_active` column to
`agent_execution_contracts`. Instead, the file's actual content is 28
`DROP TABLE` statements.

The file was never added to `apps/forge/migrations/meta/_journal.json`,
so drizzle-orm's libsql migrator never applied it. It was a latent
footgun: any tool that scanned the migrations directory to rebuild the
journal would have picked the file up and the database would have been
destroyed.

See the header comment at the top of the file for full audit context.

## Conventions for adding files here

When moving a migration to `_archive/`:

1. Use `git mv` (not delete + add) so the rename is detected.
2. Add a header comment to the SQL file documenting:
   - Original path, author, date, commit hash
   - Original intent vs. actual content
   - Why it is dangerous / not safe to apply
   - The issue that motivated the move
3. Append an entry to this README under "Files".
4. Commit with a `chore(#issue): archive orphan migration NNNN_name` message.
