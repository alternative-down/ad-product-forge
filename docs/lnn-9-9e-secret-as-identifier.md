# L#NN-9 9e — Secret-as-Identifier (Perene Final) — Day 13 Jun 13 09:05Z

**Verified as of**: 2026-06-14 (Day 14, post #5712 codification)
**Lead**: Veritas (perene + skill), Aldric (ESLint rule, deferred)
**Status**: FINAL (no longer DRAFT)

## Definition

**L#NN-9 9e** is the intersection of L#NN-9 (identifier-without-verification) and L#NN-19 (secrets-in-chat). It occurs when **the identifier IS the secret** — to discuss it (the key, the token, the credential) you must reveal it.

**Family**: L#NN-9 (identifier-without-verification)
**Sibling**: L#NN-9 9d (targetKey typo), 9f (perene table staleness)
**Parent**: L#NN-19 (secrets-in-chat, N=2 MERGED via #5685 + #5705)

## Why 9d Mitigation Breaks for 9e

The standard L#NN-9 mitigation is "verify the identifier before trusting it":

- 9d: `list_contacts` to get correct targetKey
- 9a: `git show <sha>:<file>` to verify file content
- 9b: `curl /issues/{n}` to verify issue number

For 9e, the identifier IS a secret. Pasting the secret to verify it = leaking it. **The verification protocol is a leak vector**.

## N=3 Case Studies (Day 9-10)

| #   | Who             | When            | What                                                                 | Why 9e                                                | Mitigation                          |
| --- | --------------- | --------------- | -------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------- |
| 1   | HD220 (Nicolas) | Day 9 20:00:07Z | Pasted `FORGE_ADMIN_API_KEY` + `ENCRYPTION_KEY` in Discord for #5683 | Needed to identify which variable was being discussed | "the staging API key" not the value |
| 2   | Thoren (PM)     | Day 11 17:01Z   | Shared full ENCRYPTION_KEY + decryption context in #5683 thread      | PM coordinate with Aldric required knowing which key  | "the L#NN-19 tripwire key"          |
| 3   | Orion (TPL)     | Day 11 17:02Z   | Echoed the key in DM to Thoren (propagation)                         | Coordination required confirming Thoren's reference   | "same as Thoren's reference"        |

**Pattern**: Once one agent pastes, the secret enters the DM chain and is echoed by other agents for "context". This is the L#NN-19 propagation vector.

## 3-Layer Mitigation (L#NN-19 Prevention, MERGED via #5685 + #5705)

### Layer 1: Detection tripwire

- Regex scan for `ghs_*`, base64 strings ≥32 chars, `key=`, `token=`, `secret=`
- Source: `eslint-plugin-no-secret-paste` (Aldric, MERGED)
- CI integration: any DMs that match the regex pattern are FLAGGED

### Layer 2: Redaction layer

- Auto-redact matching strings before send (L#NN-19 prevention)
- Output: `[REDACTED:env-var-name]` instead of raw value
- Audit log: every redaction logged with timestamp + sender + reason

### Layer 3: ESLint custom rule

- `eslint-plugin-lnn-9-9e` (Aldric deferred to Day 14+)
- Flags: string literals matching `ghs_*`, `key*=`, `token*=`, base64 ≥32
- Suggests: `import { secretRef } from './secrets'; console.log(secretRef(name))` instead

## Verification Protocol: "Verify Without Reveal"

When you need to confirm a claim about a secret without revealing the secret:

### Step 1: Name Reference

- Refer to the secret by NAME, not value
- ✅ "The L#NN-19 tripwire key" (name)
- ❌ "The key is `abc123...`" (value = leak)

### Step 2: Fingerprint (hash, not value)

- Share only the first 4 + last 4 chars + length
- ✅ "`a1b2...w9x8` (40 chars)"
- ❌ Full value

### Step 3: Hash (HMAC, one-way)

- HMAC-SHA256(secret, salt) = 64 hex chars
- Both parties can verify by computing the same HMAC
- ✅ `hmac: a3f2...c1d8` (irreversible)

### Step 4: Indirection (proxy, vault)

- Use a secret manager / vault reference
- ✅ `vault://prod/forge/api-key`
- ❌ The actual key value

## When Discussing Secrets — Decision Tree

```
Are you about to paste a secret value into a message/code/comment?
├── YES
│   ├── Is it a name reference (e.g., "the staging API key")? → OK
│   ├── Is it a fingerprint (first4+last4)? → OK with caveat
│   ├── Is it a hash? → OK (irreversible)
│   ├── Is it a vault reference? → OK
│   └── Otherwise (raw value)? → STOP, use one of the above
└── NO → proceed
```

## Cross-Links

- **L#NN-19 parent**: `memory/patterns/lnn-19-secrets-in-chat-2026-06-11.md` (MERGED 3-layer)
- **L#NN-9 family**: `patterns/lnn-family-claim-vs-reality-2026-06-07.md` (9d, 9f siblings)
- **9d detail**: `memory/mem321_lnn9_9d_targetkey_typo.md` (roster, targetKey typo)
- **9f detail**: `memory/mem327_perene_table_staleness.md` (decay of references over time)
- **Retro v.g**: `memory/retro-v-g-lnn-9-talking-points-2026-06-12.md` (origin of 9e sub-form)
- **#5685, #5705**: L#NN-19 prevention 3-layer (Aldric, MERGED)
- **#5683**: original ENCRYPTION_KEY leak (Nicolas-closed)
- **Skill**: `skills/lnn-9-9e-secret-identifier.md` (operational protocol)

## Anti-Pattern: "Verify by Paste"

The temptation to "just paste to confirm" is the root cause of 9e incidents. **The act of verification IS the leak**. The protocol above provides alternatives.

## Day 13+ Action Items (FINAL — all Veritas portion DONE Day 14 09:08Z)

- [x] Perene finalized (this file)
- [x] Skill file created: `skills/lnn-9-9e-secret-identifier/SKILL.md` — Day 14 Jun 14 09:08Z (moved to subdir + YAML frontmatter)
- [x] ESLint rule stub documented in SKILL.md (Aldric implementation deferred to Day 15+)
- [x] CONTRIBUTING.md drafted at `ad-product-forge/CONTRIBUTING.md` (5 layers, decision tree, examples, tripwire, refs) — Day 14 Jun 14 09:08Z
- [ ] PM cron `0 */6` content updated (Thoren review, not Veritas scope)

— Veritas, Day 14 Jun 14 09:08Z, all 5 Veritas portion items DONE; PM cron content remains Thoren scope
