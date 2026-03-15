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

// Get multiple secrets
await agent.secrets.getMultiple(['api_key', 'token']): Promise<Record<string, string>>;

// List available secrets (metadata only, no values)
await agent.secrets.list(): Promise<Array<{ name: string; type: string; }>>;
```

### 3. Admin Operations
```typescript
// Create/update secret
createSecret(input: {
  name: string;
  type: 'api_key' | 'token' | 'password' | 'connection_string';
  value: string;
}): Promise<{ secretId: string; }>;

// Rotate secret
rotateSecret(secretId: string, newValue: string): Promise<void>;

// Delete secret
deleteSecret(secretId: string): Promise<void>;

// List secrets
listSecrets(): Promise<Array<{ secretId: string; name: string; type: string; }>>;
```

---

## Database Schema

**secrets**
```
- secretId (TEXT, PRIMARY KEY)
- name (TEXT, NOT NULL, UNIQUE)
- type (TEXT)  -- api_key, token, password, etc
- encryptedValue (TEXT, NOT NULL)
- iv (TEXT)    -- initialization vector for encryption
- salt (TEXT)
- status (TEXT)  -- active, inactive, revoked
- createdAt (TEXT)
- updatedAt (TEXT)
```

**secret_versions**
```
- versionId (TEXT, PRIMARY KEY)
- secretId (TEXT, FOREIGN KEY)
- encryptedValue (TEXT)
- status (TEXT)  -- active, superseded
- createdAt (TEXT)
- supersededAt (TEXT)
```

**secret_access_logs**
```
- logId (TEXT, PRIMARY KEY)
- secretId (TEXT)
- action (TEXT)  -- retrieval, creation, rotation, deletion
- timestamp (TEXT)
- result (TEXT)  -- success, denied, error
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
- [ ] Basic audit logging
- [ ] Encryption key management

### Phase 2: Enhancement (Future)
- [ ] Secret rotation workflows
- [ ] In-memory caching with TTL
- [ ] RBAC for secret access
- [ ] CLI tools for secret management

---

## Success Criteria

- [ ] Secrets are encrypted at rest
- [ ] Agents can retrieve secrets via API
- [ ] Secrets never appear in logs
- [ ] Basic audit trail works
- [ ] Encryption key rotation possible

---

## Risks

- Encryption key compromise is critical
- In-memory plaintext exposure if not careful
- Performance impact of encryption/decryption (mitigate with caching)

---

## Future Enhancements

- Integration with external vaults (HashiCorp Vault, AWS Secrets Manager)
- Secret rotation automation
- In-memory caching with TTL
- Role-based access control
- Hardware security module (HSM) support
