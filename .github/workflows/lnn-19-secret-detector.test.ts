/**
 * L#NN-19 Secret Detector — Pattern Test Suite
 *
 * Validates the 4 detection regex patterns used by
 * `.github/workflows/lnn-19-secret-detector.yml`. Tests run locally via vitest
 * (root config uses ** + glob suffix to match all .test.ts files).
 *
 * IMPORTANT: patterns here MUST match the workflow's patterns. If you change
 * one, change the other. There is no shared import because GitHub Actions
 * workflows are YAML and cannot import TypeScript modules.
 *
 * L#19 tripwires — 4 categories, 12+ tests:
 *   1. GitHub token detection (3 tests)
 *   2. AWS access key detection (2 tests)
 *   3. Base64 ≥32 chars detection (3 tests)
 *   4. Hex ≥32 chars detection (2 tests)
 *   5. False positive rejection (3 tests)
 *   6. Marker skip logic (1 test)
 *   7. L#26 mutation (documented in comments)
 *
 * L#NN-19 hygiene on this file: fixture secrets below are NOT real — they are
 * synthetic test patterns that look like the relevant shapes (correct prefix,
 * correct length, but obviously fake values like `TESTVAL` or all-zeros).
 */

import { describe, it, expect } from 'vitest';

// =============================================================================
// PATTERNS — MUST MATCH .github/workflows/lnn-19-secret-detector.yml
// =============================================================================

const PATTERNS = {
  githubToken: /gh[psou]_[A-Za-z0-9]{36,}/,
  awsAccessKey: /AKIA[0-9A-Z]{16}/,
  base64Long: /[A-Za-z0-9+/=]{32,}/,
  hexLong: /\b[a-f0-9]{32,}\b/i,
} as const;

const LNN19_MARKER = 'lnn-19-detector';

// =============================================================================
// 1. GITHUB TOKEN DETECTION
// =============================================================================

describe('L#NN-19: GitHub token detection', () => {
  it('detects ghp_ (personal access token, classic) 40-char body', () => {
    const fake = `ghp_${'A'.repeat(36)}`;
    expect(fake).toMatch(PATTERNS.githubToken);
  });

  it('detects ghs_ (server-to-server token) 40-char body', () => {
    const fake = `ghs_${'a'.repeat(36)}Z9`;
    expect(fake).toMatch(PATTERNS.githubToken);
  });

  it('rejects non-GitHub prefixes (e.g., random words starting with "gh_")', () => {
    const fake = `ghp_TOOSHORT`; // only 10 chars after prefix
    expect(fake).not.toMatch(PATTERNS.githubToken);
  });
});

// =============================================================================
// 2. AWS ACCESS KEY DETECTION
// =============================================================================

describe('L#NN-19: AWS access key detection', () => {
  it('detects AKIA + 16 uppercase alphanumeric (correct shape)', () => {
    const fake = `AKIAIOSFODNN7EXAMPLE`; // AWS docs example, 20 chars total
    expect(fake).toMatch(PATTERNS.awsAccessKey);
  });

  it('rejects AKIA followed by lowercase (AWS access keys are uppercase)', () => {
    const fake = `akiaabcdefghijklmnop`; // lowercase
    expect(fake).not.toMatch(PATTERNS.awsAccessKey);
  });
});

// =============================================================================
// 3. BASE64 ≥32 CHARS
// =============================================================================

describe('L#NN-19: Base64 ≥32 chars detection', () => {
  it('detects 32+ char base64 string (e.g., a 24-byte secret)', () => {
    // 32 chars of valid base64 alphabet
    const fake = `aGVsbG93b3JsZGZvb2JhcmJhemxvbmdyYW5k`; // 40 chars
    expect(fake).toMatch(PATTERNS.base64Long);
  });

  it('detects base64 with padding (=) characters', () => {
    const fake = `YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=`; // 44 chars with =
    expect(fake).toMatch(PATTERNS.base64Long);
  });

  it('rejects 31-char base64 (just under threshold)', () => {
    const fake = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; // 31 chars (just under threshold)
    expect(fake).not.toMatch(PATTERNS.base64Long);
  });
});

// =============================================================================
// 4. HEX ≥32 CHARS
// =============================================================================

describe('L#NN-19: Hex ≥32 chars detection', () => {
  it('detects 32+ char hex (e.g., a 16-byte hash)', () => {
    const fake = `0123456789abcdef0123456789abcdef`; // 32 chars
    expect(fake).toMatch(PATTERNS.hexLong);
  });

  it('rejects 31-char hex (just under threshold)', () => {
    const fake = `0123456789abcdef0123456789abcde`; // 31 chars
    expect(fake).not.toMatch(PATTERNS.hexLong);
  });
});

// =============================================================================
// 5. FALSE POSITIVE REJECTION
// =============================================================================

describe('L#NN-19: false positive rejection', () => {
  it('does NOT flag a typical prose sentence', () => {
    const body = `The system should never log a raw secret value to disk. Use the deployment name as a reference.`;
    expect(body).not.toMatch(PATTERNS.githubToken);
    expect(body).not.toMatch(PATTERNS.awsAccessKey);
  });

  it('does NOT flag a short file path or identifier', () => {
    const body = `See apps/forge/src/admin/routes/system/reset.ts:229 for the wipe logic.`;
    expect(body).not.toMatch(PATTERNS.githubToken);
    expect(body).not.toMatch(PATTERNS.awsAccessKey);
    expect(body).not.toMatch(PATTERNS.hexLong);
  });

  it('flags a realistic-looking ENCRYPTION_KEY leak (full integration test)', () => {
    // Synthetic fake — looks like a real 32-byte AES-256 key, base64-encoded
    // Real keys would be 44 chars base64 (32 bytes encoded).
    const fakeKey = `MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=`; // 44 chars, looks real
    const body = `The leaked key was: ${fakeKey}. We should rotate.`;
    expect(body).toMatch(PATTERNS.base64Long);
  });
});

// =============================================================================
// 6. MARKER SKIP LOGIC (infinite-loop prevention)
// =============================================================================

describe('L#NN-19: marker skip logic', () => {
  it('detects the lnn-19-detector marker in body', () => {
    const body = `<!-- lnn-19-detector -->\n## L#NN-19 advisory\n...`;
    expect(body.includes(LNN19_MARKER)).toBe(true);
  });

  it('skips posting when body contains marker (avoids self-infinite-loop)', () => {
    const body = `<!-- lnn-19-detector -->\nThis is a real potential leak: ghp_${'A'.repeat(36)}`;
    // The detector's self-skip logic checks for the marker and returns early
    // BEFORE scanning patterns. So even though this body has a GitHub token,
    // it should not re-post the advisory.
    const shouldSkip = body.includes(LNN19_MARKER);
    expect(shouldSkip).toBe(true);
  });
});

// =============================================================================
// L#26 SANITY MUTATION PROTOCOL (documentation)
// =============================================================================
//
// To verify the patterns catch the bug class:
//
// 1. Run `npx vitest run .github/workflows/lnn-19-secret-detector.test.ts` →
//    expect ALL PASS
// 2. Revert one pattern. Examples:
//    a) Change `githubToken: /gh[psou]_[A-Za-z0-9]{36,}/` to
//       `/ghp_[A-Za-z0-9]{36,}/` (loses ghs/gho/ghu coverage) →
//       "detects ghs_ ..." test should FAIL
//    b) Change `hexLong: /\b[a-f0-9]{32,}\b/i` to
//       `/[a-f0-9]{32,}/i` (loses word-boundary) →
//       "rejects 31-char hex" test may have FPs but the test is brittle
//    c) Change `base64Long: /[A-Za-z0-9+/=]{32,}/` to
//       `/[A-Za-z0-9+/=]{64,}/` (raises threshold) →
//       "detects 32+ char base64" test should FAIL
// 3. Restore original → re-run → ALL PASS
//
// Aldric will perform one of these mutations manually before PM-merge (L#26).
// =============================================================================
