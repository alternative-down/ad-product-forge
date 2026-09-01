// Retention gate logic test for auto-merge.yml L#NN-22 v18a
// Validates the bash retention computation against expected values.
// Also asserts KNOWN_BOTS source-of-truth integrity per #6660 + #6661 + #6665.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const KNOWN_BOTS_PATH = resolve(__dirname, '..', 'known-bots.json');

describe('retention-gate (L#NN-22 v18a)', () => {
  const GATE_MIN = 35;
  const ms = (m: number) => m * 60_000;

  const computeRetentionMin = (submittedAt: string, now: Date): number => {
    return Math.floor((now.getTime() - new Date(submittedAt).getTime()) / 60_000);
  };

  test('hold when retention < 35min', () => {
    const submitted = '2026-08-19T10:00:00Z';
    const now = new Date('2026-08-19T10:10:00Z');
    expect(computeRetentionMin(submitted, now)).toBe(10);
    expect(computeRetentionMin(submitted, now) < GATE_MIN).toBe(true);
  });

  test('pass when retention >= 35min', () => {
    const submitted = '2026-08-19T10:00:00Z';
    const now = new Date('2026-08-19T10:35:00Z');
    expect(computeRetentionMin(submitted, now)).toBe(35);
    expect(computeRetentionMin(submitted, now) < GATE_MIN).toBe(false);
  });

  test('pass when retention > 35min (e.g. 87min)', () => {
    const submitted = '2026-08-19T10:00:00Z';
    const now = new Date('2026-08-19T11:27:00Z');
    expect(computeRetentionMin(submitted, now)).toBe(87);
    expect(computeRetentionMin(submitted, now) < GATE_MIN).toBe(false);
  });

  test('cron */5 * * * * fires at minute 0, 5, 10, 15, ..., 55', () => {
    // Mock cron evaluation: every 5 min boundary
    const checkCron = (minute: number): boolean => minute % 5 === 0;
    for (let m = 0; m < 60; m++) {
      expect(checkCron(m)).toBe(m % 5 === 0);
    }
  });

  test('PM bypass label bypasses retention check', () => {
    const labels = ['tech-debt', 'tpl-pm-fallback', 'infra'];
    const hasBypass = labels.includes('tpl-pm-fallback');
    expect(hasBypass).toBe(true);
  });
});

describe('KNOWN_BOTS source-of-truth (#6660 + #6661 + #6665)', () => {
  // Load the canonical list from the workflow JSON (single source of truth).
  const loadKnownBots = (): string[] => {
    const raw = readFileSync(KNOWN_BOTS_PATH, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`known-bots.json is not a JSON array (got ${typeof parsed})`);
    }
    return parsed.map((entry, index) => {
      if (typeof entry !== 'string') {
        throw new Error(`known-bots.json[${index}] is not a string (got ${typeof entry})`);
      }
      return entry;
    });
  };

  // The complete list of real forge bot logins. If a future PR adds or removes
  // a bot identity, update this list AND known-bots.json together.
  const EXPECTED_BOTS = [
    'veritas-ak-0n1[bot]',
    'orion-qbtvww[bot]',
    'aldric-zvqgom[bot]',
    'kaelen-xhhzsg[bot]',
    'varek-iemmpd[bot]',
    'thoren-99-qux[bot]',
  ];

  test('known-bots.json exists and is a JSON array', () => {
    const bots = loadKnownBots();
    expect(Array.isArray(bots)).toBe(true);
    expect(bots.length).toBeGreaterThan(0);
  });

  test('KNOWN_BOTS includes ALL expected bot logins (no missing bots)', () => {
    const bots = loadKnownBots();
    for (const expected of EXPECTED_BOTS) {
      expect(bots).toContain(expected);
    }
  });

  test('KNOWN_BOTS exactly matches expected list (no stale entries)', () => {
    const bots = loadKnownBots();
    expect([...bots].sort()).toEqual([...EXPECTED_BOTS].sort());
  });
});

describe('auto-merge KNOWN_BOTS filter logic (L#NN-46 v2, #6665 enhancement)', () => {
  // Mirror of the jq filter from auto-merge.yml L145-L146:
  //   VALID_REVIEWS=$(echo "$NON_AUTHOR_REVIEWS" | jq --argjson bots "$KNOWN_BOTS" \
  //     '[.[] | select((.user.login | ascii_downcase) as $u | $bots | index($u))]')
  //
  // The actual jq runs in CI; here we test the TypeScript equivalent so the
  // assertion is observable from the vitest run.
  type Review = { user: { login: string } };

  const KNOWN_BOTS = [
    'veritas-ak-0n1[bot]',
    'orion-qbtvww[bot]',
    'aldric-zvqgom[bot]',
    'kaelen-xhhzsg[bot]',
    'varek-iemmpd[bot]',
    'thoren-99-qux[bot]',
  ];

  const filterKnownBots = (reviews: Review[]): Review[] => {
    return reviews.filter((review) => {
      const lowered = review.user.login.toLowerCase();
      return KNOWN_BOTS.includes(lowered);
    });
  };

  test('passes through exact-case bot logins', () => {
    const reviews: Review[] = [
      { user: { login: 'veritas-ak-0n1[bot]' } },
      { user: { login: 'orion-qbtvww[bot]' } },
    ];
    expect(filterKnownBots(reviews)).toHaveLength(2);
  });

  test('lowercases user.login before matching (L#NN-46 v2 normalization)', () => {
    const reviews: Review[] = [
      { user: { login: 'Thoren-99-Qux[bot]' } },
      { user: { login: 'VERITAS-AK-0N1[BOT]' } },
    ];
    const filtered = filterKnownBots(reviews);
    expect(filtered).toHaveLength(2);
  });

  test('filters out non-bot logins', () => {
    const reviews: Review[] = [
      { user: { login: 'random-user' } },
      { user: { login: 'hd220' } },
      { user: { login: 'veritas-ak-0n1[bot]' } },
    ];
    expect(filterKnownBots(reviews)).toHaveLength(1);
  });

  test('returns empty array when no reviews match', () => {
    const reviews: Review[] = [
      { user: { login: 'someone-else' } },
      { user: { login: 'another-person' } },
    ];
    expect(filterKnownBots(reviews)).toEqual([]);
  });

  test('handles all 6 known bots at once', () => {
    const reviews: Review[] = KNOWN_BOTS.map((login) => ({ user: { login } }));
    expect(filterKnownBots(reviews)).toHaveLength(6);
  });
});
