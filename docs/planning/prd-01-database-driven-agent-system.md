# PRD — Database-Driven Agent System

**Status:** Planning - Technical Analysis & Design
**Date:** 2026-03-15
**Version:** 1.0
**Feature ID:** CORE-001

> **Note:** This is a personal solo-developer project. Requirements focus on functionality and simplicity, not enterprise-grade robustness.

---

## Executive Summary

**Framework Component:** Mastra Core - Agent Registry and Persistence

**Objective:** Transform the Mastra agent orchestration framework from static, hardcoded agent configuration to a dynamic, database-backed agent creation and management system that enables runtime agent spawning and credential management.

**Problem:** Currently, agents are created at startup with fixed configuration loaded from environment variables. This prevents dynamic agent creation and makes credential management inflexible. Any Mastra deployment needs this foundational capability.

**Solution:** Implement SQLite with Drizzle ORM as the reusable persistence layer for:
- Agent configurations and metadata (organization-agnostic)
- Communication provider credentials and settings
- Agent-to-provider mappings
- Encrypted sensitive data storage
- Support for both single-instance and distributed deployments

**Value Proposition (Framework):**
- Enable any Mastra deployment to support runtime agent creation without restart
- Secure sensitive credential storage with transparent encryption
- Provide foundation for multi-tenancy and advanced orchestration
- Simple to deploy, scales from solo developer to team use

**Value Proposition (ad-product-forge Application):**
- Enable Nicolas' agents to autonomously create specialist agents for research, development, and product launching
- Support credential management for Discord, Email, and other communication providers
- Foundation for hiring workflow and agent hierarchy

**Scope:** Phase 1 of agent lifecycle management, focusing on persistence infrastructure for the Mastra framework itself

---

## Problem Statement

### Current State
The application currently:
- Creates agents at application startup from hardcoded factory functions
- Loads provider credentials directly from environment variables (`.env`)
- Provides no runtime mechanism for agent creation or reconfiguration
- Stores communication data (contacts, messages) in per-agent SQLite databases
- Lacks a centralized agent registry or configuration repository

### Pain Points
1. **No Dynamic Agent Creation:** Cannot create agents at runtime without code changes
2. **Credentials in Plain Text:** Credentials stored in env vars without encryption
3. **No Runtime Flexibility:** Cannot change provider bindings without restart
4. **Scattered Configuration:** Config spread across environment and code

### Key Assumptions
- SQLite with Drizzle ORM is sufficient for this single-instance system
- Encryption will be handled via `crypto` module (Node.js built-in) with a master key strategy
- Communication providers (Discord, Email) will continue to work with stored credentials

---

## Objectives

### Primary Objectives
1. **Establish Central Agent Registry:** Create a database schema to persist agent configurations, including ID, name, description, instructions, and model assignments
2. **Persist Provider Credentials:** Store communication provider credentials (tokens, passwords, connection strings) in encrypted form
3. **Enable Runtime Agent Creation:** Implement APIs/tools to create agents dynamically without application restart
4. **Secure Sensitive Data:** Encrypt sensitive fields (credentials, tokens) before storage and decrypt on retrieval

### Success Criteria
- All agent configuration can be read from and written to database
- Sensitive data is encrypted at rest
- Agents can be created and started dynamically via API/tools
- System works correctly with new database-driven approach

---

## Requirements

### Functional Requirements

#### FR1: Agent Configuration Storage
- Store agent metadata: ID, name, description, model, instructions
- Track agent creation/modification timestamps

#### FR2: Agent-Provider Associations
- Associate each agent with multiple providers (Discord, Email, etc)
- Store encrypted credentials per agent-provider pair
- Support provider_type: discord, email, slack, etc

#### FR3: Encryption & Security
- Encrypt credentials JSON before storage
- Decrypt credentials on retrieval transparently
- Use AES-256-GCM encryption
- No credentials logged in plain text

#### FR4: Runtime Agent Initialization
- Load agents and their credentials from database at startup
- Decrypt credentials for each provider
- Create agent instances from database config

---

## Architecture

### Classification: AD-PRODUCT-FORGE APPLICATION

**This PRD describes persistence infrastructure specific to Nicolas' ad-product-forge application.** It is application-specific, not a reusable Mastra framework component. It defines how ad-product-forge stores and encrypts agent configurations and credentials.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│          ad-product-forge: Application Startup               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐     ┌──────────────────────────────┐ │
│  │ Environment Vars │     │ Agent Registry DB (SQLite)   │ │
│  │ (ENCRYPTION_KEY) │     │                              │ │
│  └──────────────────┘     │  agents                      │ │
│         │                 │  agent_providers             │ │
│         │                 │  (encrypted_credentials)     │ │
│         ▼                 └──────────────────────────────┘ │
│  ┌──────────────────┐                                      │
│  │ Encryption Layer │◀──────── Drizzle ORM               │
│  │ (encrypt/decrypt)│     (Query + Schema)               │
│  └──────────────────┘                                      │
│         ▲                                                   │
│         │                                                   │
│  ┌──────────────────┐                                      │
│  │ Agent Loader     │                                      │
│  └──────────────────┘                                      │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────────┐                                      │
│  │ Agent Registry   │                                      │
│  │ (In-Memory)      │                                      │
│  └──────────────────┘                                      │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────────┐                                      │
│  │ Mastra Instance  │                                      │
│  │ (Agent Executor) │                                      │
│  └──────────────────┘                                      │
│                                                            │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

#### 1. **Agent Registry Database Module** (`packages/mastra-engine/src/database/`)
- Initialize Drizzle ORM with SQLite
- Define schema using Drizzle definitions
- Provide typed query builders
- Support agent metadata storage and agent-provider associations

#### 2. **Encryption Layer** (`packages/mastra-engine/src/encryption/`)
- Load encryption key from environment
- Provide encrypt/decrypt utilities
- Support AES-256-GCM encryption
- Encrypt/decrypt credentials JSON in `agent_providers` table

#### 3. **Agent Loader** (`packages/mastra-engine/src/agent/loader.ts`)
- Query database for agents and agent_providers at startup
- Initialize encryption layer
- Decrypt credentials for each provider
- Create agent instances using database configuration

### Data Flow

#### Agent Creation Flow (Runtime)
```
User/Tool Request
    │
    ▼
Agent Creation Input (validated via Zod)
    │
    ▼
Agent Loader Service
    │
    ├─→ Validate input (agent name, model, providers)
    │
    ├─→ Generate unique agent ID
    │
    ├─→ Persist to database
    │
    └─→ Return agent instance
```

#### Agent Loading Flow (Startup)
```
Application Start
    │
    ▼
Initialize Database Connection
    │
    ├─→ Load encryption key from env
    │
    ├─→ Query agents table
    │
    ├─→ Load & decrypt provider credentials
    │
    ├─→ Initialize providers with credentials
    │
    └─→ Create agent instances in registry
```

#### Provider Credential Lookup
```
Agent needs to connect to a provider
    │
    ▼
Query agent_providers table (agent_id + provider_type)
    │
    ├─→ Get encrypted_credentials (JSON)
    │
    ├─→ Decrypt with ENCRYPTION_KEY
    │
    └─→ Extract token/password and return to agent
```

---

## Database Schema

### Schema Overview

```sql
-- Core agent configuration
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  model TEXT NOT NULL,
  instructions TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Agent-to-provider associations with encrypted credentials
CREATE TABLE agent_providers (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  provider_type TEXT NOT NULL,      -- e.g., 'discord', 'email'
  encrypted_credentials TEXT NOT NULL,  -- JSON encrypted: {token, password, etc}
  created_at INTEGER NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  UNIQUE(agent_id, provider_type)
);
```

### Encryption Strategy

**Field Encryption:**
- Only `encrypted_credentials` in `agent_providers` table is encrypted
- All other fields are plain text (agent_id, provider_type, created_at)
- Credentials are stored as encrypted JSON: `{token: "...", password: "...", etc}`
- Encryption uses AES-256-GCM

**Key Management:**
- Master key loaded from `ENCRYPTION_KEY` environment variable
- Key must be 32 bytes (256 bits) for AES-256-GCM
- Simple for solo developer (no rotation needed initially)

**Decryption at Runtime:**
```typescript
const agentProviders = await db.query.agent_providers.findMany({
  where: eq(agent_providers.agent_id, agentId)
});

for (const ap of agentProviders) {
  const decryptedCreds = decrypt(ap.encrypted_credentials);
  provider.initialize(ap.provider_type, decryptedCreds);
}
```

**Encryption Implementation (Node.js crypto):**
```typescript
import crypto from 'node:crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

export function encryptSecret(plaintext: string): string {
  const key = Buffer.from(ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 256-bit');

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, Buffer.from(ciphertext, 'hex'), authTag]);

  return combined.toString('base64');
}

export function decryptSecret(encryptedValue: string): string {
  const key = Buffer.from(ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 256-bit');

  const combined = Buffer.from(encryptedValue, 'base64');
  if (combined.length < 32) throw new Error('Invalid encrypted value');

  const iv = combined.subarray(0, 16);
  const authTag = combined.subarray(combined.length - 16);
  const ciphertext = combined.subarray(16, combined.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext.toString('hex'), 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}
```

---

## Provider Management API

### Register Provider Credentials
```typescript
async function registerProviderConfig(agentId: string, providerType: string, credentials: Record<string, string>) {
  // 1. Encrypt credentials
  const encrypted = encryptSecret(JSON.stringify(credentials));

  // 2. Store in agent_providers
  await db.insert(agent_providers).values({
    agent_id: agentId,
    provider_type: providerType,
    encrypted_credentials: encrypted,
    created_at: Date.now()
  });
}
```

### Get Provider Credentials
```typescript
async function getProviderCredentials(agentId: string, providerType: string): Promise<Record<string, string>> {
  const record = await db.query.agent_providers.findFirst({
    where: and(
      eq(agent_providers.agent_id, agentId),
      eq(agent_providers.provider_type, providerType)
    )
  });

  if (!record) return {};

  const decrypted = decryptSecret(record.encrypted_credentials);
  return JSON.parse(decrypted);
}
```

### Rotate Provider Credentials
```typescript
async function rotateProviderCredentials(agentId: string, providerType: string, newCredentials: Record<string, string>) {
  const encrypted = encryptSecret(JSON.stringify(newCredentials));

  await db.update(agent_providers)
    .set({ encrypted_credentials: encrypted })
    .where(and(
      eq(agent_providers.agent_id, agentId),
      eq(agent_providers.provider_type, providerType)
    ));
}
```

---

## Technical Decisions

### 1. SQLite + Drizzle ORM
**Decision:** Use SQLite with Drizzle ORM as the database/ORM combo

**Rationale:**
- SQLite is serverless, file-based, requires minimal setup
- Drizzle provides type-safe query building and schema management
- Single-instance system doesn't need relational database complexity
- Easy to inspect and debug

**Alternatives Considered:**
- PostgreSQL: Overkill for single-instance personal project
- Raw SQL: Lose type safety, more error-prone

### 2. AES-256-GCM Encryption
**Decision:** Use Node.js built-in `crypto` module with AES-256-GCM for field-level encryption

**Rationale:**
- No external dependencies required
- Industry-standard encryption algorithm
- GCM mode provides authenticated encryption (detects tampering)
- Performance sufficient for single-instance system

**Alternatives Considered:**
- External encryption library: Adds dependency, more complex
- Database-level encryption: Less flexible, harder to migrate

### 3. Master Key via Environment Variable
**Decision:** Store encryption master key in `ENCRYPTION_KEY` environment variable

**Rationale:**
- Simple for solo developer
- Works with `.env` file loading

### 4. Fallback to Hardcoded Config
**Decision:** Keep hardcoded agent configuration as fallback

**Rationale:**
- System works even if database is unavailable
- Allows gradual migration

