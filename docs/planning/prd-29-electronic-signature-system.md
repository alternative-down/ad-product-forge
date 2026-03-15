# PRD — Electronic Signature System

**Status:** Planning - Technical Design
**Date:** 2026-03-15
**Scope:** Personal developer project - KISS & YAGNI principles

---

## Executive Summary

Enable agents and users to digitally sign documents with cryptographic signatures for non-repudiation and audit trail.

**Core Goal:** Agents can sign documents and verify signatures with proof of who signed and when.

---

## Problem Statement

Currently, the platform cannot:
- Create cryptographic signatures on documents
- Verify document authenticity
- Prove who signed a document
- Maintain audit trail of signatures

**Target Scenarios:**
1. Agent signs a contract as part of workflow
2. User signs a document for authorization
3. Platform maintains audit trail proving document authenticity

---

## Key Features

### 1. Document Signing
```typescript
// Sign a document as agent/user
signDocument(input: {
  documentId: string;
  documentContent: Buffer;
  algorithm?: 'RSA-2048' | 'ECDSA-P256' | 'EdDSA';  // default: ECDSA-P256
}): Promise<{
  signatureId: string;
  signature: string;  // hex-encoded
  timestamp: ISO8601String;
}>;
```

### 2. Signature Verification
```typescript
// Verify a signature
verifySignature(input: {
  signatureId: string;
  documentContent: Buffer;
}): Promise<{
  isValid: boolean;
  signerId: string;
  signerType: 'agent' | 'user';
  timestamp: ISO8601String;
}>;
```

### 3. Audit Trail
```typescript
// Get signature details
getSignature(signatureId: string): Promise<{
  signatureId: string;
  documentId: string;
  signerId: string;
  timestamp: ISO8601String;
  status: 'valid' | 'revoked';
}>;

// Get audit trail
getAuditTrail(documentId: string): Promise<Array<{
  auditId: string;
  eventType: 'signed' | 'verified' | 'revoked';
  performedBy: string;
  timestamp: ISO8601String;
}>>;
```

---

## Database Schema

**signatures**
```
- signatureId (TEXT, PRIMARY KEY)
- documentId (TEXT)
- signerId (TEXT)
- signerType (TEXT)  -- agent, user
- documentHash (TEXT)  -- SHA-256
- signatureHex (TEXT)  -- hex-encoded signature
- algorithm (TEXT)  -- RSA-2048, ECDSA-P256, EdDSA
- publicKeyPEM (TEXT)
- timestamp (TEXT)
- status (TEXT)  -- valid, revoked, expired
- revokedAt (TEXT)
- createdAt (TEXT)
```

**signature_audit_trail**
```
- auditId (TEXT, PRIMARY KEY)
- signatureId (TEXT)
- documentId (TEXT)
- eventType (TEXT)  -- signed, verified, revoked, accessed
- performedBy (TEXT)
- timestamp (TEXT)
- details (TEXT)  -- JSON
```

**document_integrity**
```
- integrityId (TEXT, PRIMARY KEY)
- documentId (TEXT)
- contentHash (TEXT)  -- SHA-256
- isSealed (BOOLEAN)
- lastVerificationAt (TEXT)
- verificationStatus (TEXT)  -- valid, modified, unknown
```

---

## Security

- Support ECDSA-P256 (modern), RSA-2048 (compatibility), EdDSA (performance)
- Private keys encrypted at rest
- Document hash binding prevents signature reuse
- Audit trail immutable and encrypted

---

## Implementation

### Phase 1: Core (2 weeks)
- [ ] Signature engine (ECDSA-P256)
- [ ] Document signing and verification
- [ ] Audit trail logging
- [ ] Agent/user API integration
- [ ] Basic key management

### Phase 2: Enhancement (Future)
- [ ] Certificate management (X.509)
- [ ] Multi-party signatures
- [ ] Signature workflows
- [ ] Document sealing
- [ ] Additional algorithms (RSA, EdDSA)

---

## Success Criteria

- [ ] Agent can sign documents
- [ ] Signatures can be verified
- [ ] Audit trail is complete
- [ ] Document tampering is detected
- [ ] Signatures cannot be forged

---

## Risks

- Key compromise is critical
- Signature verification must be accurate
- Audit trail integrity is essential

---

## Compliance

- Supports ESIGN Act (USA) basic requirements
- Supports eIDAS (EU) basic requirements
- Complete audit trail for regulatory compliance
- Non-repudiation through cryptography

---

## Future Enhancements

- X.509 certificate support
- Multi-party signatures (counter-signatures)
- Signature workflows (approval chains)
- Hardware security module (HSM) support
- Blockchain-based timestamping
- Digital notarization
