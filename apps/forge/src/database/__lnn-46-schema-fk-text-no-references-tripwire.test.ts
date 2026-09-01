/**
 * L#NN-46 v4.6 schema-FK-pattern tripwire (Day 24 #6045)
 *
 * Asserts: every `text('xxx_id')` column in apps/forge/src/database/schema-*.ts
 * that LOOKS LIKE a foreign key (ends with `_id`, except known non-FK columns
 * in the allowlist) MUST have `.references()` declared at the schema level.
 *
 * Background: #6045 P2 found that agentSchedules.creatorId was declared as
 * bare `text('creator_id')` without `.references(() => agents.id, ...)`. This
 * is an "undocumented soft reference" — the relationship exists in code but
 * is invisible at the schema level, allowing orphan rows and silent data
 * corruption when the parent is deleted.
 *
 * L#NN-32 v8 codification: schema-typed truth — every relationship must be
 * declared explicitly. Bare text columns that look like FKs are a code smell.
 *
 * Allowlist (known non-FK _id columns):
 *   - external_id (external system identifier, no local FK)
 *   - provider_*_id (provider's external ID, no local FK)
 *   - idempotency_key / *_key (not a FK)
 *   - conversation_id (sometimes a key, sometimes a FK — review individually)
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_DIR = join(__dirname, '..', 'database');
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

const NON_FK_ID_COLUMNS = new Set([
  'externalId',
  'external_id',
  'idempotency_key',
  'idempotencyKey',
  'providerIdempotencyKey',
  'providerCustomerId',
  'providerSubscriptionId',
  'providerPaymentId',
  'providerRefundId',
  'providerPayoutId',
  'providerTransferId',
  'providerEventId',
  'providerAccountId',
  'providerChargeId',
  'providerDisputeId',
  'providerTokenId',
  'providerMandateId',
  'providerSetupIntentId',
  'providerPaymentIntentId',
  'providerCheckoutSessionId',
  'providerInvoiceId',
  'providerCreditNoteId',
  'routeId', // webhook route identifier (not a FK to a known table)
  'sessionId', // session token, not a DB row ID
  'correlationId', // distributed tracing ID
  'requestId', // HTTP request ID
  'eventId', // sometimes external event ID, sometimes internal
  'messageId', // email/message delivery ID
]);

function walkDir(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkDir(full, out);
    else if (full.endsWith('.ts') && !full.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

describe('L#NN-46 v4.6 schema-FK-pattern (Day 24 #6045)', () => {
  const schemaFiles = walkDir(SCHEMA_DIR);

  it('has schema files to scan', () => {
    expect(schemaFiles.length).toBeGreaterThan(0);
  });

  for (const file of schemaFiles) {
    const relative = file.replace(REPO_ROOT + '/', '');
    it(`${relative}: every *_id text column has .references()`, () => {
      const content = readFileSync(file, 'utf8');

      // Find all `xxxId: text('xxx_id')` patterns (NOT xxx_id_idx, NOT xxx_id_default)
      // Each match captures: camelCaseField, snake_case_column
      const bareTextIdRe = /(\w+Id)\s*:\s*text\(\s*['"]([^'"]+)['"]\s*\)(?!\s*\.|\s*,|\s*\n)/g;
      const matches: { field: string; column: string; index: number }[] = [];
      let m: RegExpExecArray | null;
      while ((m = bareTextIdRe.exec(content)) !== null) {
        matches.push({ field: m[1], column: m[2], index: m.index });
      }

      const violations: string[] = [];
      for (const match of matches) {
        if (NON_FK_ID_COLUMNS.has(match.field)) continue;
        if (!match.column.endsWith('_id')) continue;
        // Check that within ~3 lines after, there's a .references() call
        const snippet = content.slice(match.index, match.index + 300);
        if (!snippet.includes('.references(')) {
          violations.push(`L${match.field} (column: ${match.column})`);
        }
      }

      if (violations.length > 0) {
        throw new Error(
          `L#NN-46 v4.6 violation: ${violations.length} text *_id columns without .references():\n  ${violations.join('\n  ')}`,
        );
      }
    });
  }
});