/**
 * L#NN-13 13a tripwire for #5719 (write.test.ts): mock-vs-production alignment
 *
 * Bug class: L#NN-13 13a (test-mock-vs-check-mismatch).
 * 9 pre-existing test failures in write.test.ts had mocks/expectations that
 * didn't match the production code's actual method names, signatures, or
 * field names. This tripwire asserts the alignment is preserved.
 *
 * This test scans write.test.ts (the test file) and write.ts (the production
 * file) and asserts:
 *   - The mock for `integrations` has `upsertIntegration` and `deleteIntegration`
 *     (production calls these methods, not the old `upsert`/`delete`).
 *   - The mock for `registry` has a `get` method (production calls registry.get).
 *   - OAuth test bodies use `provider:` (schema field) not `providerId:`.
 *   - `deleteProfile` test expects a string argument (production passes string).
 *   - `integration/delete` test body includes both `providerType` and
 *     `integrationId` (schema requires both).
 *   - `settings/upsert` test expects untrimmed values (production doesn't trim).
 *   - `settings/upsert` loop test does NOT expect `loadAgent` to be called
 *     (production does not call loadAgent in this loop, only registry.add).
 *
 * ── L#NN-13 source-level regex pattern (Kaelen #5701 gold standard reference) ──
 *   - readFileSync (not mocks)
 *   - Concrete regex patterns (not equality)
 *   - Self-document L#NN-13 class + root cause in test header
 *   - L#26 mutations verify (revert-fix → fail → restore → pass)
 *
 * ── L#26 v1 + v2 will be verified below (after tripwire creation) ──
 *
 * ── Cross-links ──
 *   - #5719 (Day 14 P2, Kaelen lead, source of this tripwire)
 *   - #5701 (Kaelen L#NN-13 gold standard, finance call signature)
 *   - #5714 (Kaelen C3 tripwire, L#NN-13 pattern reference)
 *   - memory/diagnostic-frameworks/p0-masked-bugs-5-class-taxonomy.md (L#NN-17)
 *   - memory/operational-patterns/3-layer-prevention-pattern.md
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TEST_FILE = join(__dirname, 'write.test.ts');
const PROD_FILE = join(__dirname, 'write.ts');

const testSrc = readFileSync(TEST_FILE, 'utf-8');
const prodSrc = readFileSync(PROD_FILE, 'utf-8');

describe('L#NN-13 13a tripwire: write.test.ts mock-vs-production alignment', () => {
  describe('mock methods (write.test.ts)', () => {
    it('integrations mock has upsertIntegration (production calls upsertIntegration)', () => {
      expect(testSrc).toMatch(
        /makeMockIntegrations[\s\S]*?upsertIntegration\s*:\s*vi\.fn/,
      );
    });

    it('integrations mock does NOT have old `upsert` method (would mismatch production)', () => {
      expect(testSrc).not.toMatch(
        /upsert\s*:\s*vi\.fn\(\)\.mockResolvedValue\(\{\s*integrationId/,
      );
    });

    it('integrations mock has deleteIntegration (production calls deleteIntegration)', () => {
      expect(testSrc).toMatch(
        /makeMockIntegrations[\s\S]*?deleteIntegration\s*:\s*vi\.fn/,
      );
    });

    it('integrations mock does NOT have old `delete` method (would mismatch production)', () => {
      expect(testSrc).not.toMatch(
        /delete\s*:\s*vi\.fn\(\)\.mockResolvedValue\(undefined\)[\s\S]*?\}\s*\}/,
      );
    });

    it('registry mock has get method (production calls registry.get(entry.id))', () => {
      expect(testSrc).toMatch(/makeMockRegistry[\s\S]*?get\s*:\s*vi\.fn/);
    });
  });

  describe('body field names (write.test.ts)', () => {
    it('oauth test bodies do NOT use providerId: (schema field is provider)', () => {
      expect(testSrc).not.toMatch(/JSON\.stringify\(\s*\{\s*providerId\s*:/);
    });

    it('oauth tests use provider: openai-codex (schema field)', () => {
      expect(testSrc).toMatch(/JSON\.stringify\(\s*\{\s*provider\s*:\s*'openai-codex'/);
    });

    it('oauth tests use provider: all (schema field)', () => {
      expect(testSrc).toMatch(/JSON\.stringify\(\s*\{\s*provider\s*:\s*'all'/);
    });

    it('integration/delete test body has providerType + integrationId (schema requires both)', () => {
      expect(testSrc).toMatch(
        /integration\/delete[\s\S]*?providerType\s*:\s*'webhook'[\s\S]*?integrationId\s*:\s*'int-to-delete'/,
      );
    });
  });

  describe('call signatures (write.test.ts)', () => {
    it('deleteProfile is NOT called with object {profileId: ...} (production passes string)', () => {
      expect(testSrc).not.toMatch(/toHaveBeenCalledWith\(\s*\{\s*profileId/);
    });

    it('deleteProfile is called with string profileId (production passes string)', () => {
      expect(testSrc).toMatch(/toHaveBeenCalledWith\('profile-to-delete'\)/);
    });
  });

  describe('value expectations (write.test.ts)', () => {
    it('settings/upsert test expects untrimmed companyName (production does not trim)', () => {
      expect(testSrc).toMatch(/companyName:\s*' Acme Corp '/);
    });
  });

  describe('loop test expectations (write.test.ts)', () => {
    it('settings/upsert loop test does NOT expect loadAgent (production does not call it)', () => {
      expect(testSrc).not.toContain('expect(mockLoader).toHaveBeenCalledTimes(2)');
    });
  });

  describe('production code uses mocked methods (write.ts)', () => {
    it('production calls integrations.upsertIntegration(body)', () => {
      expect(prodSrc).toContain('integrations.upsertIntegration(body)');
    });

    it('production calls integrations.deleteIntegration(body.providerType)', () => {
      expect(prodSrc).toContain('integrations.deleteIntegration(body.providerType)');
    });

    it('production calls registry.get(entry.id)', () => {
      expect(prodSrc).toContain('registry.get(entry.id)');
    });

    it('production reads body.provider for oauth/sync (schema field)', () => {
      expect(prodSrc).toContain('body.provider');
    });

    it('production calls llmSettings.deleteProfile(body.profileId) with string', () => {
      expect(prodSrc).toContain('llmSettings.deleteProfile(body.profileId)');
    });
  });
});
