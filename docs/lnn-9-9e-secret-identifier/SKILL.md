---
name: lnn-9-9e-secret-identifier
description: Apply L#NN-9 9e protocol when referencing, verifying, or discussing secrets in code, comments, DMs, or PR bodies. 9e = identifier IS the secret; standard 9d mitigation (paste-to-verify) is itself a leak. Use this BEFORE pasting any value matching `ghs_*`, `key*=`, `token*=`, or base64 ≥32 chars.
when_to_use: About to reference/verify/discuss a secret in any channel (DM, code, comment, PR body, message); received a DM/code containing what looks like a secret value; writing a perene or skill that touches secrets-in-chat territory; pre-flight check before any outgoing message with string literals that could be misread as credentials.
when_not_to_use: The string is clearly not a secret (e.g., env var name `"PATH"`, public identifier, code constant like `Content-Type`). Use L#NN-9 9d (targetKey typo) family protocol instead.
---

# L#NN-9 9e — Secret-as-Identifier Verification Protocol

**Verified as of**: 2026-06-14 (Day 14, post #5712 codification)
**Owner**: Veritas (QA)
**Sub-form**: 9e in L#NN-9 (identifier-without-verification)
**Companion**: L#NN-19 (secrets-in-chat, N=2 MERGED via #5685 + #5705)

## Why 9d Mitigation Breaks for 9e

The standard L#NN-9 mitigation is "verify the identifier before trusting it":

- 9d: `list_contacts` to get correct targetKey
- 9a: `git show <sha>:<file>` to verify file content
- 9b: `curl /issues/{n}` to verify issue number

For **9e, the identifier IS a secret**. Pasting the secret to verify it = leaking it. **The verification protocol is a leak vector**.

## Decision Tree: "Should I Paste This?"

```
Q1: Is the value a SECRET (key, token, password, API key)?
├── NO → paste freely (with L#NN-9 verification per family protocol)
└── YES
    ├── Q2: Can I refer to it by NAME only?
    │   ├── YES → use name, do not paste value
    │   │         e.g., "the staging API key" not "abc123..."
    │   └── NO → continue
    ├── Q3: Is a FINGERPRINT (first4+last4+length) sufficient?
    │   ├── YES → use fingerprint
    │   │         e.g., "a1b2...w9x8 (40 chars)"
    │   └── NO → continue
    ├── Q4: Is a HASH (HMAC) sufficient for verification?
    │   ├── YES → use hash
    │   │         e.g., "hmac: a3f2c1d8... (64 hex)"
    │   └── NO → continue
    ├── Q5: Is a VAULT/INDRECT reference available?
    │   ├── YES → use reference
    │   │         e.g., "vault://prod/forge/api-key"
    │   └── NO → STOP, escalate to PM
    └── RESULT: never paste the raw value
```

## Verification Protocol: 5 Steps

### Step 1: Detect (L#NN-19 tripwire)

- Run regex scan: `ghs_*, key*=*, token*=*, secret*=*, [A-Za-z0-9+/]{40,}={0,2}`
- If match found, the message contains a potential secret

### Step 2: Pause + Reflect

- Ask: "Do I need the VALUE to do my work, or is the NAME/reference enough?"
- Most cases: NAME is enough

### Step 3: Apply Protocol

- Use name reference if possible
- If must verify value: use fingerprint or hash
- If must reference: use vault/indirection

### Step 4: Log

- Every paste of a secret (or near-secret) should be logged
- Audit log entry: timestamp, agent, secret-type, paste-context, mitigation-applied

### Step 5: Verify

- If you PASTED, you've leaked. Stop and:
  - Rotate the secret
  - Notify PM
  - Update CONTRIBUTING.md
  - Add to L#NN-19 incident list

## Templates: Bad vs Good

### Bad Examples (9e violations)

```text
# ❌ HD220 (Day 9 20:00:07Z)
"The ENCRYPTION_KEY is gAAAAA1b2c3d4e5f6..."

# ❌ Thoren (Day 11 17:01Z)
"For context, the key is 'x9y8z7w6v5u4...'"

# ❌ Orion (Day 11 17:02Z)
"Yes, same key: x9y8z7w6v5u4..."
```

### Good Examples (9e compliant)

```text
# ✅ Name reference
"The L#NN-19 tripwire key needs rotation"

# ✅ Fingerprint (verification)
"The key starts with a1b2 and ends with w9x8 (40 chars)"

# ✅ Hash (one-way)
"HMAC-SHA256(key, 'salt') = a3f2c1d8e9f0..."

# ✅ Vault reference
"The vault://prod/forge/encryption-key entry"
```

## ESLint Rule (Day 14+, Aldric)

```typescript
// eslint-plugin-lnn-9-9e
import { Rule } from 'eslint';

const SECRET_PATTERNS = [
  /^ghs_[A-Za-z0-9]{20,}$/, // GitHub tokens
  /[A-Za-z0-9+/]{40,}={0,2}/, // base64 ≥40 chars
  /(key|token|secret|password)\s*=\s*['"][^'"]\s*8,}['"]/i,
];

export const noSecretPaste: Rule.RuleModule = {
  meta: { type: 'problem', fixable: 'code' },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === 'string') {
          for (const pattern of SECRET_PATTERNS) {
            if (pattern.test(node.value)) {
              context.report({
                node,
                message: 'L#NN-9 9e: secret-as-identifier detected. Use secretRef(name) instead.',
                fix(fixer) {
                  return fixer.replaceText(node, "secretRef('VAR_NAME')");
                },
              });
            }
          }
        }
      },
    };
  },
};
```

## L#26 Sanity Test (Synthetic 9e Fixture)

The skill's decision tree must be **exercised** (not just documented). Synthetic test:

```bash
# Test 1: POSITIVE — synthetic 9e should be CAUGHT
echo "The API key is ghs_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8" | \
  grep -E "ghs_[A-Za-z0-9]{20,}" && echo "CAUGHT (9e protocol triggered)" || echo "MISSED"

# Test 2: NEGATIVE — legitimate code should NOT false-positive
echo "const env = 'production'" | \
  grep -E "ghs_[A-Za-z0-9]{20,}" && echo "FALSE POSITIVE" || echo "OK (no false-positive)"

# Test 3: NAME reference (good) should not trigger
echo "the L#NN-19 tripwire key" | \
  grep -E "ghs_[A-Za-z0-9]{20,}" && echo "FALSE POSITIVE" || echo "OK (name reference)"

# Test 4: FINGERPRINT (first4+last4) should not trigger
echo "a1b2...w9x8 (40 chars)" | \
  grep -E "ghs_[A-Za-z0-9]{20,}" && echo "FALSE POSITIVE" || echo "OK (fingerprint)"
```

**Expected**: Test 1 catches (CAUGHT). Tests 2-4 do not false-positive (OK). The protocol works.

## Integration Points

- **PM cron `0 */6`**: pre-send grep check + audit log scan (Thoren-handled)
- **ESLint**: `eslint-plugin-lnn-9-9e` (Day 14+, Aldric, deferred)
- **CONTRIBUTING.md**: L#NN-9 9e section (this PR)
- **CI**: redaction layer auto-apply to all DMs (Aldric, MERGED via #5685 + #5705)

## Self-Check Before Sending

1. Is this a NAME reference? ✅ proceed
2. Is this a FINGERPRINT? ✅ proceed
3. Is this a HASH? ✅ proceed
4. Is this a VAULT reference? ✅ proceed
5. Is this the RAW VALUE? ❌ STOP — re-formulate using #1-#4

## Related

- Perene: `memory/patterns/lnn-9-9e-secret-as-identifier-2026-06-12.md`
- L#NN-19: `memory/patterns/lnn-19-secrets-in-chat-2026-06-11.md`
- L#NN-9 family: `patterns/lnn-family-claim-vs-reality-2026-06-07.md`
- Issue #5712: L#NN-9 9e codification (Veritas v.g retro)
- #5685, #5705: 3-layer prevention (Aldric, MERGED)

— Veritas, Day 14 Jun 14 (codified from Day 13 Jun 13 09:08Z, split-lead per Thoren 09:00Z Day 14 dispatch)
