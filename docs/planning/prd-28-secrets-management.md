# PRD 28: Secrets Management System

**Status:** Planning - Technical Design
**Date:** 2026-03-15
**Scope:** Personal developer project - KISS & YAGNI principles

---

## Executive Summary

Implement a simple secrets management system to securely store API keys, tokens, and passwords used by agents.

**Core Goal:** Agents can securely retrieve credentials without exposing them in logs or code.

---

## Problem Statement

Currently, secrets are:
- Stored as environment variables (not scalable)
- Hardcoded in config files (security risk)
- Not encrypted
- Not auditable

**Target Scenarios:**
1. Agent securely retrieves Stripe API key
2. Agent gets database credentials without exposing them
3. Admin can rotate secrets without restarting

---

## Key Features

### 1. Secure Storage
- Encrypt all secrets using AES-256-GCM
- Store encryption key in environment
- Prevent secrets from appearing in logs

### 2. Agent API
```typescript
// Get a secret
await agent.secrets.get('stripe_api_key'): Promise<string>;

// List available secrets (metadata only, no values)
await agent.secrets.list(): Promise<Array<{ name: string; }>>;
```

### 3. Admin Operations
```typescript
// Create/update secret
createSecret(input: {
  name: string;
  value: string;
}): Promise<{ secretId: string; }>;

// Delete secret
deleteSecret(secretId: string): Promise<void>;

// List secrets
listSecrets(): Promise<Array<{ secretId: string; name: string; }>>;
```

---

## Database Schema

**secrets**
```
- secretId (TEXT, PRIMARY KEY)
- name (TEXT, NOT NULL, UNIQUE)
- encryptedValue (TEXT, NOT NULL)
- iv (TEXT)    -- initialization vector for encryption
- createdAt (TEXT)
```

---

## Security

- All values encrypted with AES-256-GCM
- Encryption key from environment variable `SECRETS_ENCRYPTION_KEY`
- Secrets never logged or exposed in error messages
- Access to all operations logged in audit trail

---

## Implementation

### Phase 1: Core (2 weeks)
- [ ] Encryption/decryption layer
- [ ] Secrets storage and retrieval
- [ ] Agent API for secret access
- [ ] Encryption key management

### Phase 2: Enhancement (Future)
- [ ] In-memory caching with TTL

---

## Success Criteria

- [ ] Secrets are encrypted at rest
- [ ] Agents can retrieve secrets via API
- [ ] Secrets never appear in logs

---

## Risks

- Encryption key compromise is critical
- In-memory plaintext exposure if not careful
- Performance impact of encryption/decryption (mitigate with caching)

---

## Future Enhancements

- In-memory caching with TTL
