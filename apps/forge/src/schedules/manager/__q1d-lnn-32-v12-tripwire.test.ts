/**
 * L#NN-32 v12 6th-probe tripwire — Q1-D Day 23 cast + silent-failure sweep
 *
 * Closes cluster tripwire for Q1-D issues:
 *   #5941 — normalize.ts type-lie cast on scheduledDateRaw
 *   #5942 — llm/runtime-model.ts type-lie cast on providerId
 *   #5943 — mutations.ts 9 redundant casts
 *   #5944 — store.ts 5 silent .catch() failures
 *   #5945 — lifecycle-ops.ts non-null assertion
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const NORMALIZE_TS = join(__dirname, 'normalize.ts');
const RUNTIME_MODEL_TS = join(__dirname, '..', '..', 'llm', 'runtime-model.ts');
const MUTATIONS_TS = join(__dirname, 'mutations.ts');
const STORE_TS = join(__dirname, 'store.ts');
const LIFECYCLE_OPS_TS = join(__dirname, 'lifecycle-ops.ts');

function stripComments(src: string): string {
  src = src.replace(/\/\*[\s\S]*?\*\//g, '');
  return src.replace(/^\s*\/\/.*$/gm, '');
}

describe('Q1-D Day 23 cluster tripwire (L#NN-32 v12)', () => {
  describe('#5941 normalize.ts scheduledDateRaw', () => {
    it('source has 0 scheduledDateRaw as number casts', () => {
      const src = stripComments(readFileSync(NORMALIZE_TS, 'utf8'));
      const matches = src.match(/scheduledDateRaw as number/g) ?? [];
      expect(matches).toHaveLength(0);
    });

    it('source uses typeof guard for narrowing', () => {
      const src = stripComments(readFileSync(NORMALIZE_TS, 'utf8'));
      expect(src).toMatch(/typeof scheduledDateRaw === 'number'/);
    });
  });

  describe('#5942 llm/runtime-model.ts providerId', () => {
    it('source has 0 providerId literal-union casts', () => {
      const src = stripComments(readFileSync(RUNTIME_MODEL_TS, 'utf8'));
      const matches = src.match(/providerId as 'openai-codex' \| 'claude-code'/g) ?? [];
      expect(matches).toHaveLength(0);
    });

    it('source validates providerId against literal union', () => {
      const src = stripComments(readFileSync(RUNTIME_MODEL_TS, 'utf8'));
      expect(src).toMatch(/providerId !== 'openai-codex' && providerId !== 'claude-code'/);
    });
  });

  describe('#5943 mutations.ts redundant casts', () => {
    it('source has 0 (record as { id: string }).id casts', () => {
      const src = stripComments(readFileSync(MUTATIONS_TS, 'utf8'));
      const matches = src.match(/\(record as \{ id: string \}\)\.id/g) ?? [];
      expect(matches).toHaveLength(0);
    });

    it('source has 0 as UpdateAgentScheduleInput casts', () => {
      const src = stripComments(readFileSync(MUTATIONS_TS, 'utf8'));
      const matches = src.match(/as UpdateAgentScheduleInput/g) ?? [];
      expect(matches).toHaveLength(0);
    });
  });

  describe('#5944 store.ts silent .catch removals', () => {
    it('source has 0 .catch(() => []) patterns', () => {
      const src = stripComments(readFileSync(STORE_TS, 'utf8'));
      const matches = src.match(/\.catch\(\(\) => \[\]\)/g) ?? [];
      expect(matches).toHaveLength(0);
    });

    it('source has 0 .catch(() => null) patterns', () => {
      const src = stripComments(readFileSync(STORE_TS, 'utf8'));
      const matches = src.match(/\.catch\(\(\) => null\)/g) ?? [];
      expect(matches).toHaveLength(0);
    });
  });

  describe('#5945 lifecycle-ops.ts non-null assertion', () => {
    it('source has 0 getLifecycle()!.register in __registerSchedule', () => {
      const src = stripComments(readFileSync(LIFECYCLE_OPS_TS, 'utf8'));
      const fnBody = src.match(/async function __registerSchedule[\s\S]*?\n {2}\}/);
      expect(fnBody).not.toBeNull();
      expect(fnBody![0]).not.toMatch(/getLifecycle\(\)!\.register/);
    });
  });
});
