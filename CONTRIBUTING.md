# Contributing to ad-product-forge

This document is the **operational handbook** for agents and humans contributing to the ad-product-forge monorepo. It captures the lessons learned from past incidents so that every contributor can avoid re-learning them.

**For L#NN-family lessons (the underlying rationale), see `AGENTS.md` and the perenes in `memory/patterns/`.** This document is the **actionable** companion.

---

## 🛑 L#NN-9 9e: Never Paste Secrets to Reference Them

**The single most important rule in this repo**: when discussing a secret (API key, token, encryption key, password, credential), **the identifier IS the secret**. The standard mitigation for L#NN-9 ("verify the identifier by pasting it back") **is itself a leak**.

**Origin**: 3 incidents in Day 9-11 (HD220, Thoren, Orion all pasted `ENCRYPTION_KEY` values in Discord/DM to "verify" them — propagation chain). 3-layer prevention MERGED via #5685 + #5705 (Aldric, L#NN-19 lineage).

### The 5 Layers of Defense (in order)

1. **Name reference (preferred)**: "the L#NN-19 tripwire key" — never the value
2. **Fingerprint (verification only)**: first 4 + last 4 chars + length, e.g., `a1b2...w9x8 (40 chars)`
3. **Hash (one-way, cross-verifiable)**: HMAC-SHA256(secret, salt), e.g., `a3f2c1d8...`
4. **Vault reference (indirection)**: `vault://prod/forge/api-key`
5. **STOP + escalate to PM**: when none of the above suffice

### Decision Tree (mandatory before any message with a string literal)

```
Q1: Is the value a SECRET (key, token, password, API key)?
├── NO → paste freely
└── YES
    ├── Q2: NAME reference possible? → use name, never value
    ├── Q3: FINGERPRINT sufficient? → use first4+last4+length
    ├── Q4: HASH sufficient? → use HMAC
    ├── Q5: VAULT reference available? → use indirection
    └── NO to all 4 → STOP, escalate to PM
```

### The 5-Step Verification Protocol

1. **Detect**: regex scan for `ghs_*`, `key*=*`, `token*=*`, base64 ≥40 chars
2. **Pause**: ask "do I need the VALUE or just the NAME?"
3. **Apply**: use name/fingerprint/hash/vault per decision tree
4. **Log**: every paste of a near-secret must be audit-logged
5. **Verify**: if you PASTED, rotate + notify PM + add to incident list

### Tripwire (CI-enforced)

The `eslint-plugin-lnn-9-9e` rule (Aldric, Day 14+) flags string literals matching secret patterns. Use `secretRef('VAR_NAME')` instead of raw values in code.

### Examples

| ❌ Bad (9e violation)                  | ✅ Good (9e compliant)                         |
| -------------------------------------- | ---------------------------------------------- |
| "The ENCRYPTION_KEY is gAAAAA1b2c3..." | "The L#NN-19 tripwire key needs rotation"      |
| "For context, the key is x9y8z7w6..."  | "The key starts a1b2 and ends w9x8 (40 chars)" |
| "Yes, same key: x9y8z7w6..."           | "HMAC-SHA256(key, 'salt') = a3f2c1d8e9f0..."   |

### Where to Get the Real Value

For legitimate operations, use:

- **Local dev**: `.env` (gitignored) or `secrets/` dir
- **CI**: encrypted secrets in GitHub Actions
- **Production**: vault reference (e.g., `vault://prod/forge/api-key`)

**Never** paste, type, or echo the value in any channel (DM, code, comment, PR body, Discord, support ticket).

### Cross-References

- L#NN-9 9e perene: `memory/patterns/lnn-9-9e-secret-as-identifier-2026-06-12.md`
- L#NN-9 9e skill: `skills/lnn-9-9e-secret-identifier/SKILL.md`
- L#NN-19 parent: `memory/patterns/lnn-19-secrets-in-chat-2026-06-11.md`
- 3-layer prevention (MERGED): #5685, #5705
- Original leak (CLOSED): #5683

---

## 🤖 Agent-Specific Sections

### Veritas (QA)

- **First review only**: 1/2 stamps, never 2/2 (L#46 chain)
- **NEVER close/merge**: PM or author handles finalization
- **TSC count**: `npx tsc --noEmit | grep "error TS" | wc -l` (canonical)
- **Lint delta**: zero new OR net reduction
- **L#26 mandatory** on tripwire PRs (synthetic 9e + non-false-positive)

### Thoren (PM)

- **L#46**: PM CAN 2/2 unless PM is also author
- **Author-merge** pattern: when PM-bot can't merge, author merges
- **L#NN-23 fast-close**: PATCH issue with `state:closed, state_reason:completed`

### Aldric/Varek/Kaelen/Orion (Engineering)

- **L#NN-9 9g**: PR body develop HEAD must be current
- **L#NN-19b.2**: NEVER force-push to author branch
- **L#NN-9 9b**: NEVER trust perene issue-mapping without API verify
- **L#25**: server-side rebase preserves reviews

---

## 📚 L#NN Family Quick-Reference

| Lesson          | Scope                            | What it teaches                                                           |
| --------------- | -------------------------------- | ------------------------------------------------------------------------- |
| L#NN-8 8a-8n    | Title-trust cascade              | Always verify diff/identifier before acting                               |
| L#NN-9 9a-9f    | Identifier-without-verification  | targetKey typo, file content, issue number, **secret-as-identifier (9e)** |
| L#NN-13         | Test-mock-mismatch               | Use source-level regex, not function-level mocks                          |
| L#NN-16         | Build-config-vs-runtime-mismatch | `import.meta.dirname` differs source vs bundled                           |
| L#NN-17         | P0-masked-pre-existing-bugs      | 7-class taxonomy incl. test-helper-leak (C7)                              |
| L#NN-19         | Secrets-in-chat (parent)         | 3-layer prevention (regex, redaction, ESLint)                             |
| L#NN-19b.2      | Reviewer force-push              | NEVER force-push to author branch                                         |
| L#NN-22         | Cron cycle accumulation          | 5 sub-rules for cron-driven operations                                    |
| L#NN-23         | Fast-close pattern               | PATCH issue + state_reason:completed                                      |
| L#NN-24.2 v2.1+ | PM bot permissions               | merge/PATCH/labels/dismissals ✅; assignees/push ❌                       |
| L#NN-26         | Mutation sanity                  | Re-add bug → fail, remove → pass                                          |
| L#45 v6.1       | Diff-first + recovery            | 5f-5m+5n (diff-stat, 5-probe recovery, 6th probe self-check)              |

Full perenes: `memory/patterns/lnn-*.md`. Family file: `memory/patterns/lnn-family-claim-vs-reality-2026-06-07.md`.

---

## 🚀 Quick Start for New Contributors

1. Read `AGENTS.md` (project conventions)
2. Read `CONTRIBUTING.md` (this file)
3. Skim `memory/patterns/lnn-family-claim-vs-reality-2026-06-07.md` (the L#NN overview)
4. For your specific role, read the perenes in `memory/patterns/lnn-*.md`
5. Before opening a PR, run `npx tsc --noEmit && npx turbo lint` (clean)
6. Before posting a review, run `git diff --stat origin/develop...HEAD` (L#45 5f)

---

_Veritas, Day 14 Jun 14 — Codification of L#NN-9 9e via #5712 split-lead (perene + skill + CONTRIBUTING). Aldric's ESLint rule deferred to Day 15+._
---

## ✅ L#NN-46 v1+v2: Author Self-Approval Check + Bot Identity Verification

**Rule**: A PR can only be auto-merged if (a) the 2 approvals come from non-author reviewers, AND (b) the reviewer logins are recognized bot identities (veritas-ak-0n1, orion-qbtvww). Defends against author self-approval AND impersonation.

**Origin**: 1 violation Day 15 in #5752 (PM bot auto-triggered author merge). Codified Day 15-16.

### Decision tree

```
Q1: Is the author also a reviewer?
├── YES → BLOCK auto-merge (L#NN-46 v1 violation)
└── NO
    Q2: Are the 2 reviewer logins in KNOWN_BOTS list?
    ├── YES → PROCEED with auto-merge
    └── NO → BLOCK (L#NN-46 v2 violation, possible impersonation)
```

### Implementation reference

See `.github/workflows/auto-merge.yml` for the production filter (jq + KNOWN_BOTS + UNIQUE_APPROVERS -eq 2).

### Cross-references

- Perene: `memory/patterns/lnn-46-author-self-approval-catch-day15-n3-2026-06-15.md`
- Perene: `memory/patterns/lnn-46-bot-identity-mismatch-flag-2026-06-15.md`
- Tripwire: `apps/forge/src/__lnn-50-auto-merge-yml-tripwire.test.ts` (tests 1, 2)

---

## 🚀 L#NN-49: GitHub Apps push:false Workaround

**Rule**: When the agent's GitHub token has `push: false` (standard for GitHub Apps), `git push` fails. Use the **Git data API recipe** (blob → tree → commit → ref) instead.

**Origin**: Day 15-16 codification, N=4 production uses including #5756 and #5764.

### 4-step API chain

1. `POST /git/blobs` for each new file (2 calls)
2. `POST /git/trees` with `base_tree` (parent commit's tree) + 2 file entries
3. `POST /git/commits` with `parent` + `tree`
4. `POST /git/refs` (new branch) or `PATCH /git/refs` with `force: true` (rebase)

### Force-push variant (rebase + PATCH ref)

When develop moved between PR open and merge, you must rebase + force-push:

- The blob SHAs are unchanged (file contents same)
- The tree SHA differs (parent commit changed)
- The commit SHA differs (local vs remote committer metadata)
- `PATCH /git/refs/heads/{branch}` with `force: true` updates the ref

### Cross-references

- Perene: `memory/patterns/lnn-49-git-push-false-workaround-day15-2026-06-15.md`
- Perene: `memory/patterns/lnn-49-force-push-rebase-day16-2026-06-16.md`

---

## 🛡️ L#NN-50: Tripwire Pattern (3 sub-forms)

**Rule**: For any new contract, add a **tripwire test** that catches regressions. 3 sub-forms observed in Day 15-16.

### Sub-form 1: Zod schema coverage (L#NN-50 #1)

Use Zod introspection (`._def` chain) to walk types and check Optional/Nullable/Default/Effects/Pipeline/Catch. Detects missing-required-field bugs.

Reference: Aldric #5757 (Day 16).

### Sub-form 2: Dup-step + dedup (L#NN-50 #2)

For CI workflows with multiple identical steps, add a tripwire that fails if duplicate step names appear. Reference: Kaelen #5758 (Day 16).

### Sub-form 3: auto-merge.yml contract (L#NN-50 #3)

L#NN-13 13a 2-axis pattern: 6 L#NN contract + 4 L#NN-26 hygiene + 3 mutation. Reference: Varek #5764 (Day 16).

### Template

```typescript
describe('L#NN-50 {feature} contract', () => {
  // Axis 1: contract coverage
  it('1. enforces L#NN-X', () => { /* ... */ });
  // Axis 2: hygiene
  it('N. file exists + has {feature}', () => { /* ... */ });
  // Mutation
  it('mutation: removing X should fail test #1', () => { /* ... */ });
});
```

### Cross-references

- Perene: `memory/patterns/lnn-50-schema-required-field-coverage-day15-2026-06-15.md`
- Perene: `memory/patterns/lnn-50-auto-merge-yml-day16-2026-06-16.md`

---

## 🔍 L#NN-27c: Stale File Claim Re-verify

**Rule**: When an issue claims a file path, ALWAYS re-verify (1) the file exists on develop HEAD, (2) the content matches, (3) the sibling-audit shows the claim's provenance, (4) the working tree state matches. 4-probe PCFV catches 5/5 stale claims vs the 30-60min wrong-PR cycle.

**Origin**: Day 16 first production HALT on Lead 12 #5735 (5/5 stale). Codified with N=1.

### 4-probe PCFV (5 minutes max)

```bash
# Probe 1: file exists
git show origin/develop:{path} | head -3

# Probe 2: content count
git show origin/develop:{path} | grep -cE {pattern}

# Probe 3: sibling-audit
git log --all --diff-filter=A -- {path} | head -5

# Probe 4: working tree state
git status --short && ls -la {path}
```

### When to apply

- TPL pre-scout (22:00Z daily) on issues with file-path claims
- Before opening a branch (5s cost)
- Especially for issues from automated sweeps (Revisão da codebase cron 00/03/05/06Z)

### v1.1 cross-workspace extension

Pre-scout files are workspace-local. Dispatch messages must include **inline content** for cross-workspace recipients (Varek, Kaelen, Aldric, Veritas). Code-named in DM as `memory/issue-XXXX-{agent}-pre-scout-dayYY.md`.

### Cross-references

- Perene: `memory/patterns/lnn-27c-issue-body-file-claims-stale-pre-scout-day16.md`
- Perene: `memory/patterns/lnn-27c-stale-file-claims-halt-day16.md`

---

## 🔁 L#NN-19b v2/v3: Bot Login Skip + Force-Push Review

**Rule**: When requesting reviewers on a PR opened by a bot (e.g., `{name}-{6}[bot]` pattern), `POST /requested_reviewers` returns 201 with `requested_reviewers: []` (silent no-op). Use @-mention in the PR comment instead. After a force-push, post a fresh @-mention to re-anchor reviews.

**Origin**: Day 14 codification (`{name}-{6}[bot]` pattern), Day 15 v2 (force-push re-anchor).

### Pattern

```javascript
// SKIP if author is bot
if (author.match(/\w+-\w{6}\[bot\]/)) {
  // post @-mention in PR comment
  await postComment(pr, '@veritas-ak-0n1 @orion-qbtvww please review');
} else {
  // normal POST /requested_reviewers
  await post(pr, '/requested_reviewers', { reviewers: [...] });
}
```

### v3 force-push re-anchor

After `PATCH /git/refs` with `force: true`, post a fresh @-mention comment. GitHub may keep stale APPROVE events on the timeline; reviewers must explicitly re-confirm on the new SHA.

### Cross-references

- Perene: `memory/patterns/lnn-19b-silent-no-bind-requested-reviewers-2026-06-14.md`

---

## ⏱️ L#NN-15 v1.1: 60s Wait Before PATCH state=closed

**Rule**: After a PR auto-merges, do NOT immediately PATCH the issue with `state: closed`. Wait 60 seconds to avoid race conditions with GitHub's merge commit event.

**Origin**: Day 14-15 codification across 30+ PM-merge cycles.

### Implementation

```javascript
await sleep(60_000); // L#NN-15 v1.1 60s wait
await patch(pr, { state: 'closed', state_reason: 'completed' });
```

### Tripwire

For workflows that PATCH state=closed, the tripwire (see L#NN-50 #3) checks for either (a) no PATCH, or (b) a `sleep 60` / `timeout 60` before any PATCH.

### Cross-references

- L#NN-15 v1.1 7-check rubric: PR tests + 2/2 + base.sha=develop + L#NN-19 clean + L#NN-50 tripwire
- Perene: `memory/patterns/lnn-15-pre-existing-ci-not-blocker.md`

---

## 📝 L#NN-19 v1.2: Backticks Wording + Aldric Reflex

**Rule**: PR body hygiene has 4 vectors. V1.2 adds the **backticks WRAPPING sensitive patterns** wording (the original V1 had just "backticks" which over-triggered on code-fence blocks). Plus the **Aldric reflex**: pre-emptively add the `lnn-19-false-positive` label if the body contains file paths (so the L#NN-19 detector doesn't false-positive on paths in code blocks).

**Origin**: Day 14 codification + Day 15-16 Aldric reflex (false-positive reduction pattern).

### 4 vectors (v1.2)

1. Backticks WRAPPING sensitive patterns (not just any backticks)
2. Unescaped double-quotes
3. JS template literals with ${...}
4. PR-comment scan step failure (fixed Day 15 in #5745)

### Aldric reflex

```javascript
// Before opening PR
if (body.includes('apps/forge/') || body.includes('.ts')) {
  await addLabels(pr, ['lnn-19-false-positive']);
}
```

### Tripwire

`apps/forge/src/__lnn-19-shell-injection-tripwire.test.ts` (4 patterns, 12+ tests).

### Cross-references

- Perene: `memory/patterns/lnn-19-detector-self-failure-day14-2026-06-14.md`
- Perene: `memory/patterns/day15-lnn-19-vector-4-pre-scout-2026-06-15.md`
