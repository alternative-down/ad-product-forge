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
