# PRD — Database-Driven Agent System

**Status:** Planning - Technical Analysis & Design
**Date:** 2026-03-15
**Version:** 1.0
**Feature ID:** CORE-001

---

## Executive Summary

**Objective:** Transform the agent platform from static, hardcoded agent configuration to a dynamic, database-backed agent creation and management system that enables runtime agent spawning, configuration persistence, and secure credential management.

**Problem:** Currently, agents are created at startup with fixed configuration loaded from environment variables. This approach limits scalability, prevents dynamic agent creation, and makes credential management inflexible and unsafe.

**Solution:** Implement SQLite with Drizzle ORM as the persistence layer for:
- Agent configurations and metadata
- Communication provider credentials and settings
- Agent-to-provider mappings
- Encrypted sensitive data storage
- Database migrations for schema versioning

**Value Proposition:**
- Enable runtime agent creation without application restart
- Support role-based access control and permission management
- Secure sensitive credential storage with transparent encryption
- Provide foundation for advanced features (agent hiring, specialist agents, scheduling)
- Maintain backward compatibility with existing hardcoded configuration

**Scope:** Phase 1 of agent lifecycle management, focusing on persistence infrastructure

---

## Problem Statement

### Current State
The application currently:
- Creates agents at application startup from hardcoded factory functions
- Loads provider credentials directly from environment variables (`.env`)
- Provides no runtime mechanism for agent creation or reconfiguration
- Stores communication data (contacts, messages) in per-agent SQLite databases
- Lacks a centralized agent registry or configuration repository
- Offers no way to revoke or rotate provider credentials without application restart

### Pain Points
1. **Scalability Limitation:** Cannot dynamically create agents without modifying code and restarting
2. **Credential Security:** Credentials in environment variables are not encrypted at rest
3. **Configuration Inflexibility:** Cannot bind different providers to different agents at runtime
4. **Lack of Audit Trail:** No way to track when/how agents and credentials were created or modified
5. **Single Source of Truth Missing:** Agent configuration scattered across environment, code, and per-agent databases

### Key Assumptions
- SQLite with Drizzle ORM will be sufficient for initial deployment (single-instance system)
- Encryption will be handled via `crypto` module (Node.js built-in) with a master key strategy
- Backward compatibility with existing hardcoded agent setup is required during transition
- Communication providers (Discord, Email) will continue to work with stored credentials

---

## Objectives

### Primary Objectives
1. **Establish Central Agent Registry:** Create a database schema to persist agent configurations, including ID, name, description, instructions, and model assignments
2. **Persist Provider Credentials:** Store communication provider credentials (tokens, passwords, connection strings) in encrypted form
3. **Enable Runtime Agent Creation:** Implement APIs/tools to create agents dynamically without application restart
4. **Secure Sensitive Data:** Encrypt sensitive fields (credentials, tokens) before storage and decrypt on retrieval
5. **Support Database Migrations:** Implement versioning strategy to manage schema evolution safely

### Secondary Objectives
6. Support multi-tenant credential isolation
7. Enable credential rotation without application restart
8. Provide audit logging for agent and credential changes
9. Enable per-agent provider selection and configuration

### Success Criteria
- All agent configuration can be read from and written to database
- Sensitive data is encrypted at rest and in transit
- Agents can be created and started dynamically via API/tools
- Backward compatibility maintained (hardcoded agents still work as fallback)
- Zero data loss during migration from static to database-driven setup
- Schema version tracking prevents incompatibility issues

---

## Requirements

### Functional Requirements

#### FR1: Agent Configuration Storage
- Store agent metadata in database: ID, name, description, model reference
- Store agent instructions (system prompt/rules)
- Support multiple agents per system
- Associate agents with communication providers
- Track agent creation/modification timestamps

#### FR2: Provider Credential Management
- Store provider credentials: API tokens, usernames, passwords, connection strings
- Support multiple credential sets per provider type
- Enable credential rotation (add new credential, mark old as inactive)
- Support credential revocation without application restart
- Associate credentials with specific agents

#### FR3: Provider Configuration Schema
- Store provider-specific settings (API endpoints, ports, TLS settings)
- Support provider-specific metadata (e.g., Discord channel ID allowlists, email BCC addresses)
- Enable per-provider feature toggles
- Store provider settings per agent (allow agent-specific configuration)

#### FR4: Encryption & Security
- Encrypt sensitive fields before database storage
- Transparent decryption on retrieval
- Support key rotation strategy
- Prevent accidental credential logging
- Support encrypted fields: API tokens, passwords, connection strings, OAuth credentials

#### FR5: Database Migrations
- Implement migration system for schema versioning
- Support forward and backward migration paths (where appropriate)
- Track applied migrations in database
- Prevent application startup if migrations are unapplied
- Support rollback for development/testing scenarios

#### FR6: Runtime Agent Instantiation
- Load agent configuration from database at startup
- Create agent instances from database configuration
- Support both database-backed and hardcoded agent creation (migration phase)
- Enable fallback to hardcoded config if database unavailable
- Support hot-reload of non-sensitive configuration (without restart)

#### FR7: Provider Integration
- Load communication provider credentials from database
- Initialize providers with persisted credentials at startup
- Support changing provider credentials without code changes
- Maintain compatibility with existing provider interfaces (Discord, Email)

### Non-Functional Requirements

#### NFR1: Security
- Encryption key managed securely (environment variable or key management service)
- Encryption/decryption overhead < 10ms per operation
- No sensitive data logged by default
- Compliance-ready audit trail for credential access/modification

#### NFR2: Performance
- Agent lookup from database < 50ms
- Credential retrieval/decryption < 100ms
- Database initialization < 2 seconds at startup
- Migration execution < 5 seconds per migration

#### NFR3: Reliability
- Graceful degradation if encryption key unavailable
- Transaction support for atomic credential updates
- Rollback capability for failed migrations
- Schema integrity validation on startup

#### NFR4: Usability
- Clear error messages for configuration/credential issues
- Type-safe APIs using TypeScript/Zod validation
- Intuitive database schema matching domain concepts
- CLI or admin tools for manual credential management (future)

#### NFR5: Maintainability
- Clear separation between encryption layer and business logic
- Drizzle ORM provides type safety and query generation
- Documented schema and field purposes
- Migration history viewable in version control

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Startup                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐     ┌──────────────────────────────┐ │
│  │ Environment Vars │     │   Agent Database (SQLite)    │ │
│  │  (ENCRYPTION_KEY)      │                              │ │
│  └──────────────────┘     │ ┌─ agents ─────────────────┐ │ │
│         │                 │ │ ┌─ agent_providers ─────┐ │ │
│         │                 │ │ │ ┌─ providers ────────┐ │ │ │
│         ▼                 │ │ │ │ ┌─ credentials ───┐ │ │ │ │
│  ┌──────────────────┐     │ │ │ │ │ ┌─ migrations ─┐ │ │ │ │ │
│  │ Encryption Layer │────▶│ │ │ │ │ │              │ │ │ │ │ │
│  │  (encrypt/decrypt)     │ │ │ │ │ └──────────────┘ │ │ │ │ │
│  └──────────────────┘     │ │ │ │ └────────────────┘ │ │ │ │
│                          │ │ │ └──────────────────┘ │ │ │
│         ▲                 │ │ └──────────────────────┘ │ │
│         │                 │ └───────────────────────────┘ │
│  ┌──────────────────┐     │                              │
│  │ Agent Loader     │────▶│  Drizzle ORM               │
│  │  (Runtime Init)  │     │  (Query Builder + Schema)   │
│  └──────────────────┘     │                              │
│         │                 └──────────────────────────────┘
│         ▼
│  ┌──────────────────┐
│  │  Agent Registry  │
│  │  (In-Memory)     │
│  └──────────────────┘
│         │
│         ▼
│  ┌──────────────────┐
│  │ Mastra Instance  │
│  │ (Agent Executor) │
│  └──────────────────┘
│
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

#### 1. **Agent Database Module** (`packages/mastra-engine/src/database/`)
- Initialize Drizzle ORM with SQLite
- Define schema using Drizzle definitions
- Provide typed query builders and migrations

#### 2. **Encryption Layer** (`packages/mastra-engine/src/encryption/`)
- Load encryption key from environment
- Provide encrypt/decrypt utilities
- Support multiple encryption algorithms (initial: AES-256-GCM)
- Handle key rotation strategy

#### 3. **Agent Loader** (`packages/mastra-engine/src/agent-loader/`)
- Query database for agents and providers at startup
- Initialize encryption layer
- Create agent instances using database configuration
- Fallback to hardcoded configuration if database unavailable

#### 4. **Provider Credential Manager** (`packages/mastra-engine/src/providers/credential-manager.ts`)
- Load and decrypt provider credentials
- Manage credential lifecycle (create, update, revoke)
- Validate credentials before provider initialization
- Handle credential rotation transparently

#### 5. **Migration System** (`packages/mastra-engine/src/database/migrations/`)
- Track applied migrations in database
- Execute pending migrations at startup
- Provide rollback capability
- Validate schema integrity after migration

### Data Flow

#### Agent Creation Flow (Runtime)
```
User/Tool Request
    │
    ▼
Agent Creation Input (validated via Zod)
    │
    ▼
Agent Loader
    ├─ Generate agent ID (CUID)
    ├─ Insert agent config into database
    └─ Select providers
        │
        ▼
    Credential Manager
        ├─ Retrieve provider credentials
        ├─ Decrypt credentials
        └─ Return plaintext credentials
        │
        ▼
    Provider Initialization
        ├─ Discord provider (token)
        ├─ Email provider (IMAP/SMTP credentials)
        └─ Internal chat provider
        │
        ▼
    Mastra Agent Instance
        │
        ▼
    Agent Registry (in-memory map)
        │
        ▼
    Agent Running
```

#### Credential Rotation Flow
```
Credential Rotation Request
    │
    ▼
Credential Manager
    ├─ Validate new credential
    ├─ Encrypt new credential
    ├─ Insert new credential entry
    └─ Mark old credential as inactive
        │
        ▼
    On Next Agent Initialize
        ├─ Query latest active credential
        ├─ Decrypt credential
        └─ Use in provider initialization
        │
        ▼
    No restart required
```

---

## Database Schema

### Schema Design Principles
- **Normalization:** Separate concerns (agents, providers, credentials) into distinct tables
- **Encryption:** Sensitive fields marked for transparent encryption
- **Auditability:** Track creation/modification timestamps and by which agent/user
- **Flexibility:** Support future features (multiple credentials per provider, feature flags)
- **Referential Integrity:** Foreign keys enforce consistency

### Core Tables

#### `agents`
Stores agent configuration and metadata.

```sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY,                    -- CUID format
  name TEXT NOT NULL,
  description TEXT,
  instructions TEXT NOT NULL,             -- System prompt
  model_id TEXT NOT NULL,                 -- Reference to model config
  status TEXT NOT NULL DEFAULT 'active',  -- active | inactive | archived
  metadata_json TEXT,                     -- Additional config (JSON)
  created_at TEXT NOT NULL,               -- ISO 8601
  updated_at TEXT NOT NULL,               -- ISO 8601
  created_by TEXT,                        -- Agent ID who created this

  UNIQUE(name)
);
```

**Sensitive Fields:** None (instructions may contain sensitivity, but not secrets)

**Indexes:**
- `PRIMARY KEY (id)`
- `UNIQUE (name)`
- `INDEX (status, created_at DESC)` — for listing/filtering

---

#### `agent_providers`
Maps agents to communication providers and stores agent-specific provider config.

```sql
CREATE TABLE agent_providers (
  id TEXT PRIMARY KEY,                    -- CUID format
  agent_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,              -- discord | email | internal-chat
  provider_config_json TEXT,              -- Provider-specific config (JSON)
                                          -- Examples:
                                          -- Discord: { allowedChannelIds: [], respondToMentionsOnly: true }
                                          -- Email: { imapPort: 993, smtpPort: 587, bcc: "..." }
  status TEXT NOT NULL DEFAULT 'active',  -- active | inactive
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  UNIQUE(agent_id, provider_id),
  FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE
);
```

**Sensitive Fields:** None (config stored here is non-secret)

**Indexes:**
- `PRIMARY KEY (id)`
- `UNIQUE(agent_id, provider_id)` — ensure one provider per agent
- `INDEX (agent_id)` — find providers for an agent
- `INDEX (provider_id)` — find agents using a provider

---

#### `providers`
Metadata about available communication providers.

```sql
CREATE TABLE providers (
  id TEXT PRIMARY KEY,                    -- discord | email | internal-chat
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,                     -- external | internal
  requires_credentials BOOLEAN NOT NULL,  -- true for discord/email, false for internal-chat
  schema_json TEXT,                       -- JSONSchema for provider config
  created_at TEXT NOT NULL,

  UNIQUE(name)
);
```

**Sensitive Fields:** None (metadata only)

**Example rows:**
```json
{
  "id": "discord",
  "name": "Discord",
  "description": "Discord bot communication provider",
  "type": "external",
  "requires_credentials": true,
  "schema_json": "{...JSONSchema...}"
}
```

---

#### `credentials`
Stores encrypted credentials for communication providers.

```sql
CREATE TABLE credentials (
  id TEXT PRIMARY KEY,                    -- CUID format
  provider_id TEXT NOT NULL,              -- discord | email
  credential_type TEXT NOT NULL,          -- bot_token | imap_password | smtp_password | api_key
  credential_name TEXT,                   -- Human-readable label (optional)
  encrypted_value TEXT NOT NULL,          -- [ENCRYPTED] Base64-encoded encrypted value
  iv TEXT NOT NULL,                       -- [ENCRYPTED] Base64-encoded IV for GCM
  tag TEXT NOT NULL,                      -- [ENCRYPTED] Base64-encoded auth tag for GCM
  algorithm TEXT NOT NULL DEFAULT 'aes-256-gcm',
  status TEXT NOT NULL DEFAULT 'active',  -- active | inactive | revoked
  metadata_json TEXT,                     -- Non-secret metadata (e.g., account name, email)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,                        -- Agent/user ID who created

  FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE RESTRICT,
  INDEX (provider_id, status) — find active credentials for a provider
);
```

**Sensitive Fields:** `encrypted_value`, `iv`, `tag` (encryption parameters)

**Indexes:**
- `PRIMARY KEY (id)`
- `INDEX (provider_id, status)` — find active credentials by provider
- `INDEX (status, updated_at DESC)` — audit/cleanup queries

**Encryption Strategy:**
- Each credential encrypted individually with unique IV
- IV and auth tag stored alongside ciphertext
- Master encryption key sourced from environment variable
- Algorithm: AES-256-GCM (authenticated encryption)

---

#### `provider_accounts`
Tracks provider account information for each provider instance (e.g., Discord bot user ID, email account).

```sql
CREATE TABLE provider_accounts (
  id TEXT PRIMARY KEY,                    -- CUID format
  provider_id TEXT NOT NULL,
  agent_id TEXT,                          -- Which agent uses this account (optional for shared accounts)
  external_account_id TEXT NOT NULL,      -- Provider's internal ID (Discord user ID, email address)
  account_display_name TEXT,              -- Human-readable account name
  credentials_id TEXT NOT NULL,           -- Reference to active credentials
  metadata_json TEXT,                     -- Provider-specific account data
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  UNIQUE(provider_id, external_account_id),
  FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE RESTRICT,
  FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  FOREIGN KEY(credentials_id) REFERENCES credentials(id) ON DELETE RESTRICT
);
```

**Sensitive Fields:** None (credentials referenced separately)

**Indexes:**
- `PRIMARY KEY (id)`
- `UNIQUE(provider_id, external_account_id)`
- `INDEX (agent_id)` — find accounts for agent
- `INDEX (provider_id)` — find all accounts for provider

---

#### `migrations`
Tracks applied schema migrations.

```sql
CREATE TABLE migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL UNIQUE,           -- Semantic version: 001_initial_schema
  description TEXT,
  applied_at TEXT NOT NULL,               -- ISO 8601 timestamp
  checksum TEXT,                          -- SHA256 hash of migration file for validation
  rolled_back_at TEXT,                    -- NULL while applied, timestamp if rolled back

  UNIQUE(version)
);
```

**Sensitive Fields:** None

**Indexes:**
- `PRIMARY KEY (id)`
- `UNIQUE (version)`
- `INDEX (rolled_back_at)` — find currently active migrations

---

#### `agent_credentials_mapping` (Future: Not in Phase 1)
Maps agents to their active credentials for each provider.

```sql
CREATE TABLE agent_credentials_mapping (
  agent_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  credential_id TEXT NOT NULL,

  PRIMARY KEY(agent_id, provider_id),
  FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE CASCADE,
  FOREIGN KEY(credential_id) REFERENCES credentials(id) ON DELETE RESTRICT
);
```

**Purpose:** Allow querying "which credential should this agent use for this provider"

---

### Schema Diagram

```
┌─────────────────────┐
│      agents         │
├─────────────────────┤
│ id (PK)             │
│ name (UNIQUE)       │
│ description         │
│ instructions        │
│ model_id            │
│ status              │
│ metadata_json       │
│ created_at          │
│ updated_at          │
│ created_by          │
└─────────────────────┘
        │
        │ (1:N)
        ▼
┌──────────────────────────┐
│   agent_providers        │
├──────────────────────────┤
│ id (PK)                  │
│ agent_id (FK)            │
│ provider_id (FK)         │
│ provider_config_json     │
│ status                   │
│ created_at               │
│ updated_at               │
└──────────────────────────┘
        │
        │ (N:1)
        ▼
┌──────────────────────┐
│     providers        │
├──────────────────────┤
│ id (PK)              │
│ name (UNIQUE)        │
│ description          │
│ type                 │
│ requires_credentials │
│ schema_json          │
│ created_at           │
└──────────────────────┘
        │
        │ (1:N)
        ▼
┌───────────────────────────┐
│      credentials          │
├───────────────────────────┤
│ id (PK)                   │
│ provider_id (FK)          │
│ credential_type           │
│ credential_name           │
│ encrypted_value [ENC]     │
│ iv [ENC]                  │
│ tag [ENC]                 │
│ algorithm                 │
│ status                    │
│ metadata_json             │
│ created_at                │
│ updated_at                │
│ created_by                │
└───────────────────────────┘

┌──────────────────────────┐
│  provider_accounts       │
├──────────────────────────┤
│ id (PK)                  │
│ provider_id (FK)         │
│ agent_id (FK, nullable)  │
│ external_account_id      │
│ account_display_name     │
│ credentials_id (FK)      │
│ metadata_json            │
│ created_at               │
│ updated_at               │
└──────────────────────────┘

┌──────────────────────────┐
│      migrations          │
├──────────────────────────┤
│ id (PK)                  │
│ version (UNIQUE)         │
│ description              │
│ applied_at               │
│ checksum                 │
│ rolled_back_at           │
└──────────────────────────┘
```

---

## Encryption Strategy

### Overview
Encryption protects sensitive data (credentials, tokens, passwords) at rest in the database. The strategy uses:
- **Algorithm:** AES-256-GCM (authenticated encryption)
- **Key Management:** Master key from environment variable
- **Storage:** Credentials stored encrypted with IV and auth tag
- **Decryption:** Transparent decryption during credential retrieval

### Encryption Architecture

```
┌─────────────────────────────────────────────────┐
│          Encryption Layer                       │
├─────────────────────────────────────────────────┤
│                                                 │
│  Environment Variable: ENCRYPTION_MASTER_KEY    │
│  (base64-encoded 32-byte key)                   │
│         │                                        │
│         ▼                                        │
│  ┌─────────────────────┐                        │
│  │ Key Manager         │                        │
│  │ - Load key          │                        │
│  │ - Validate length   │                        │
│  │ - Fallback to cache │                        │
│  └─────────────────────┘                        │
│         │                                        │
│    ┌────┴─────┬──────────┐                      │
│    │           │          │                     │
│    ▼           ▼          ▼                     │
│  ┌──────┐  ┌──────┐  ┌──────────┐              │
│  │Encrypt│  │Decrypt│  │RotateKey │             │
│  └──────┘  └──────┘  └──────────┘              │
│    │           │          │                     │
│    ├─ Generate IV         │                     │
│    ├─ Encrypt plaintext   │                     │
│    ├─ Generate auth tag   │                     │
│    └─ Return ciphertext   │                     │
│                           │                     │
│        Decrypt ◄──────────┤                     │
│        ├─ Retrieve IV     │                     │
│        ├─ Decrypt         │                     │
│        ├─ Verify auth tag │                     │
│        └─ Return plaintext│                     │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Key Specifications

#### Master Encryption Key
```
Environment Variable: ENCRYPTION_MASTER_KEY
Format: Base64-encoded 32-byte key (256 bits)
Example: base64(randomBytes(32))
Storage: .env (loaded at startup, never logged)
Rotation: Supported via migration (Phase 2)
```

#### Encryption Parameters
```
Algorithm: aes-256-gcm
Key Length: 256 bits (32 bytes)
IV Length: 12 bytes (96 bits) — randomly generated per encryption
Auth Tag Length: 16 bytes (128 bits) — generated by GCM
Plaintext: Raw credential value
Ciphertext: IV || Encrypted Data || Auth Tag (all base64-encoded)
```

#### Encrypted Fields
- `credentials.encrypted_value` — The actual credential (token, password, etc.)
- `credentials.iv` — Initialization vector (base64)
- `credentials.tag` — Authentication tag (base64)

### Encryption/Decryption Flow

#### Encrypt (on credential creation/update)
```
1. Load master encryption key from environment
2. Validate key is 32 bytes
3. Generate random 12-byte IV
4. Create cipher: crypto.createCipheriv('aes-256-gcm', key, iv)
5. Encrypt plaintext credential
6. Get auth tag from cipher
7. Encode: base64(iv) || base64(encrypted) || base64(tag)
8. Store in database
```

#### Decrypt (on credential retrieval)
```
1. Load master encryption key from environment
2. Retrieve encrypted_value, iv, tag from database
3. Decode base64 values
4. Create decipher: crypto.createDecipheriv('aes-256-gcm', key, iv)
5. Set auth tag
6. Decrypt ciphertext
7. Verify auth tag (throws if corrupted)
8. Return plaintext credential
```

### Key Management Strategy

#### Initial Deployment
- Generate 32-byte random key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- Set `ENCRYPTION_MASTER_KEY` in production environment
- Ensure key is backed up and accessible only to authorized infrastructure

#### Key Rotation (Future)
- Create new encrypted credentials with new key
- Reencrypt existing credentials (batch job)
- Update `ENCRYPTION_MASTER_KEY` environment variable
- Monitor for decryption failures during transition
- Archive old key for recovery period (90 days)

#### Key Compromise
- Rotate all credentials immediately
- Generate new master key
- Reencrypt all credentials with new key
- Audit access logs
- Consider credential expiration policy

### Security Properties

| Aspect | Property |
|--------|----------|
| Confidentiality | AES-256-GCM provides strong confidentiality |
| Integrity | GCM authentication tag detects tampering |
| Authenticity | Encryption tag prevents forgery |
| Replay Protection | Random IV per encryption prevents replay |
| Key Derivation | Master key must be 256 bits (32 bytes) |
| Algorithm Strength | AES-256 is NIST-approved, no known breaks |

### Limitations & Assumptions

- **Single Master Key:** System assumes one master key per environment. Multi-key support deferred to Phase 2.
- **Key Storage:** Key must be securely managed by infrastructure (e.g., AWS Secrets Manager, HashiCorp Vault). Phase 1 uses environment variable.
- **No Perfect Forward Secrecy:** Compromise of master key exposes all credentials ever encrypted with it.
- **Runtime Key Exposure:** Key is loaded into memory at startup. Consider secure enclaves for higher security.

---

## Migration Strategy

### Overview
Migrations provide a structured way to evolve the database schema over time, ensuring all environments stay synchronized and changes are auditable.

### Migration Architecture

```
┌────────────────────────────────────────┐
│   Drizzle Migrations                   │
├────────────────────────────────────────┤
│                                        │
│  Migration Files (TypeScript):         │
│  ├─ 001_initial_schema.ts              │
│  ├─ 002_add_agent_credentials.ts       │
│  ├─ 003_add_encryption_fields.ts       │
│  └─ 004_add_audit_logging.ts           │
│                                        │
│        │ (on startup)                  │
│        ▼                                │
│  ┌─────────────────────────────────┐   │
│  │ Migration Runner                │   │
│  │ - Detect pending migrations     │   │
│  │ - Execute in order              │   │
│  │ - Track in migrations table     │   │
│  │ - Validate checksums            │   │
│  │ - Rollback on error             │   │
│  └─────────────────────────────────┘   │
│        │                                 │
│        ▼                                 │
│  ┌─────────────────────────────────┐   │
│  │ Database Schema                 │   │
│  │ (Updated with new tables)       │   │
│  └─────────────────────────────────┘   │
│                                        │
└────────────────────────────────────────┘
```

### Phase 1: Initial Schema Migrations

#### Migration: 001_initial_schema
**Purpose:** Create core tables for agent management and credential storage

**Tables Created:**
- `agents`
- `agent_providers`
- `providers`
- `credentials`
- `provider_accounts`
- `migrations` (self-referential)

**Execution Time:** ~1 second
**Rollback:** Not required for initial deployment

#### Migration: 002_add_provider_configuration
**Purpose:** Add provider-specific configuration support

**Changes:**
- Add `provider_config_json` column to `agent_providers`
- Add `schema_json` column to `providers`
- Add `metadata_json` column to `credentials`

#### Migration: 003_add_audit_fields
**Purpose:** Add audit trail for compliance and debugging

**Changes:**
- Add `created_by` and `updated_at` fields to agents, credentials
- Add `rolled_back_at` to migrations table

### Migration Workflow

#### Development
```bash
# Create new migration
npm run db:create-migration -- --name "add_new_feature"

# Apply migrations
npm run db:migrate

# Rollback last migration (for testing)
npm run db:rollback
```

#### Production
```bash
# Check pending migrations before deploy
npm run db:status

# Apply migrations (automatic on app startup)
npm start

# Verify success
npm run db:validate
```

### Migration File Structure

```typescript
// migrations/001_initial_schema.ts
import { sql } from 'drizzle-orm';
import type { Migration } from '../types';

export const migration: Migration = {
  version: '001_initial_schema',
  description: 'Create core tables for agent management',

  up: async (db) => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        instructions TEXT NOT NULL,
        model_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by TEXT
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        type TEXT NOT NULL,
        requires_credentials BOOLEAN NOT NULL DEFAULT false,
        schema_json TEXT,
        created_at TEXT NOT NULL
      )
    `);

    // ... more tables
  },

  down: async (db) => {
    // Rollback: drop tables in reverse order
    await db.execute(sql`DROP TABLE IF EXISTS migrations`);
    await db.execute(sql`DROP TABLE IF EXISTS credentials`);
    // ... etc
  }
};
```

### Migration Safety Mechanisms

#### Checksum Validation
```typescript
// Verify migration file hasn't been modified
const fileChecksum = sha256(migrationFileContent);
const dbChecksum = migrations.find(m => m.version === version).checksum;
if (fileChecksum !== dbChecksum) {
  throw new Error('Migration file has been modified!');
}
```

#### Idempotency
```typescript
// All migrations use "CREATE TABLE IF NOT EXISTS"
// Can be safely re-run without errors
await db.execute(sql`CREATE TABLE IF NOT EXISTS agents (...)`);
```

#### Atomic Transactions
```typescript
// Entire migration runs in single transaction
await db.transaction(async (tx) => {
  await tx.execute(sql`...`);
  await tx.execute(sql`...`);
  // If any fails, entire transaction rolls back
});
```

#### Validation on Startup
```typescript
// Before agent initialization, verify:
1. All migrations have been applied
2. Schema matches expected version
3. All required tables exist
4. No conflicts with existing data
```

### Rollback Strategy

#### Automatic Rollback
- If migration fails, entire transaction is rolled back
- Application exits with error message
- No partial state changes

#### Manual Rollback
```bash
# Rollback last migration (development only)
npm run db:rollback

# Rollback to specific version
npm run db:rollback -- --to 002_initial_schema
```

#### Constraints
- Rollback only supported for migrations not yet in production
- Production rollbacks require explicit approval
- Data deletion migrations are one-way (no automatic rollback)

---

## Implementation Plan

### Phase 1: Core Infrastructure (Weeks 1-4)

#### Week 1: Database & Encryption Layer
**Deliverables:**
- [ ] Drizzle ORM setup and schema definitions
- [ ] Encryption/decryption utilities with AES-256-GCM
- [ ] Master key management from environment
- [ ] Unit tests for encryption (round-trip, edge cases)

**Files to Create:**
- `packages/mastra-engine/src/database/schema.ts` — Drizzle schema definitions
- `packages/mastra-engine/src/encryption/index.ts` — Encryption utilities
- `packages/mastra-engine/src/encryption/key-manager.ts` — Master key handling
- `packages/mastra-engine/src/database/client.ts` — Database initialization

**Dependencies to Add:**
- `drizzle-orm@latest`
- `drizzle-kit@latest` (for migrations)
- (no additional crypto deps; use Node.js built-in)

#### Week 2: Migration System
**Deliverables:**
- [ ] Migration runner and tracker
- [ ] Initial schema migrations (tables creation)
- [ ] Migration validation and checksums
- [ ] Tests for migration execution and rollback

**Files to Create:**
- `packages/mastra-engine/src/database/migrations/runner.ts`
- `packages/mastra-engine/src/database/migrations/001_initial_schema.ts`
- `packages/mastra-engine/src/database/migrations/002_add_audit_fields.ts`
- `packages/mastra-engine/src/database/types.ts`

#### Week 3: Agent Loader & Provider Credential Manager
**Deliverables:**
- [ ] Agent loader to read from database at startup
- [ ] Credential manager for secure retrieval and decryption
- [ ] Provider factory updated to use database credentials
- [ ] Fallback to hardcoded configuration

**Files to Create:**
- `packages/mastra-engine/src/agent-loader/index.ts`
- `packages/mastra-engine/src/providers/credential-manager.ts`
- `packages/mastra-engine/src/providers/provider-factory.ts`

**Updates to Existing:**
- `packages/mastra-engine/src/create-forge-agent.ts` — Add database loader
- `apps/forge/src/main.ts` — Initialize encryption and agent loader

#### Week 4: Integration & Testing
**Deliverables:**
- [ ] End-to-end integration tests (agent creation → provider init)
- [ ] Backward compatibility tests (hardcoded agents still work)
- [ ] Documentation and runbooks
- [ ] Code review and refinement

**Test Coverage:**
- [ ] Encryption: round-trip, key validation, algorithm correctness
- [ ] Database: schema integrity, migrations, constraints
- [ ] Agent Loading: empty database, single agent, multiple agents
- [ ] Provider Integration: Discord, Email, Internal Chat
- [ ] Fallback: hardcoded config used when database unavailable
- [ ] Error Handling: missing key, corrupted credentials, schema mismatch

### Phase 2: Runtime Agent Creation (Weeks 5-8)
**Goals:** Enable dynamic agent creation via API/tools

**Deliverables:**
- [ ] Agent creation tool/API
- [ ] Credential validation before provider init
- [ ] Credential rotation API
- [ ] Audit logging for agent/credential changes

### Phase 3: Advanced Features (Weeks 9-12)
**Goals:** Multi-tenant support, key rotation, CLI tools

**Deliverables:**
- [ ] Multi-tenant credential isolation
- [ ] Master key rotation workflow
- [ ] CLI for manual credential management
- [ ] Admin dashboard (future)

---

## Dependencies

### New Dependencies

#### Production
- **drizzle-orm** (v0.x): SQL query builder, type-safe ORM
- **drizzle-kit** (v0.x): Migration tooling and schema introspection
- **better-sqlite3** (optional for local development): SQLite driver for Node.js
- (Node.js `crypto` built-in): Encryption/decryption

#### Development
- **vitest**: Testing framework (already in use)
- **@types/node**: TypeScript types for Node.js (already in use)

### Compatibility
- Requires Node.js >= 20 (for crypto.createCipheriv, crypto.createDecipheriv)
- Compatible with existing @mastra/core (no changes to agent interface)
- SQLite compatible with existing LibSQL setup

### Migration Path
- SQLite supports SQLite ↔ PostgreSQL migration (deferred to Phase 2)
- Drizzle supports multiple database backends
- Encryption layer is database-agnostic

---

## Success Metrics

### Functional Metrics
1. **Agent Configuration Persistence:** 100% of agent configuration stored in database and reloadable
2. **Credential Security:** 100% of sensitive credentials encrypted at rest
3. **Migration Success:** All migrations apply without manual intervention
4. **Provider Initialization:** All providers (Discord, Email, Internal) successfully init from database credentials
5. **Backward Compatibility:** Hardcoded agents still work as fallback

### Performance Metrics
1. **Agent Lookup:** < 50ms to query agent from database
2. **Credential Retrieval:** < 100ms to decrypt and return credential
3. **Startup Time:** < 2 seconds for database initialization and agent loading
4. **Encryption Overhead:** < 10ms per encrypt/decrypt operation

### Quality Metrics
1. **Test Coverage:** > 85% for database and encryption modules
2. **Error Handling:** All error paths have graceful fallback or clear messaging
3. **Documentation:** All schema tables, encryption flow, and migration process documented
4. **Code Review:** All changes reviewed by at least one other engineer

### Security Metrics
1. **Credential Leakage:** Zero credentials logged or exposed in error messages
2. **Encryption Validation:** All decrypted credentials verified via auth tag
3. **Key Management:** Master key never logged or exposed in code
4. **Audit Trail:** All credential access logged with timestamp and actor

---

## Risks & Mitigation

### Risk 1: Data Migration from Static to Database
**Severity:** High
**Probability:** High

**Description:** Existing agents created via hardcoded config need migration to database. If migration fails or is incomplete, agents may not initialize.

**Mitigation:**
- Implement backward compatibility: fallback to hardcoded config if database unavailable
- Create migration utility to bulk-insert hardcoded agents into database
- Test migration with existing agent configurations before production rollout
- Provide rollback path: if needed, disable database loader and use hardcoded config

---

### Risk 2: Encryption Key Compromise
**Severity:** Critical
**Probability:** Low

**Description:** If `ENCRYPTION_MASTER_KEY` environment variable is exposed, all credentials are compromised.

**Mitigation:**
- Use environment-specific key management (AWS Secrets Manager, HashiCorp Vault)
- Never commit key to version control (use .env.local)
- Rotate key quarterly minimum
- Implement key rotation workflow for emergency rotation
- Log all credential access for audit
- Use separate keys per environment (dev, staging, prod)

---

### Risk 3: Performance Degradation
**Severity:** Medium
**Probability:** Low

**Description:** Database queries for agent loading and credential retrieval might add latency at startup or during agent creation.

**Mitigation:**
- Cache agent configurations in memory after loading
- Pre-decrypt frequently-used credentials to reduce on-demand decryption overhead
- Use database indexes for fast lookups (agent_id, provider_id, credential_id)
- Load test with 1000+ agents to validate performance
- Monitor startup time and credential retrieval latency

---

### Risk 4: Schema Evolution Complexity
**Severity:** Medium
**Probability:** Medium

**Description:** As features evolve, database schema needs updates. Migrations might fail in production if not carefully planned.

**Mitigation:**
- Use idempotent migrations (CREATE TABLE IF NOT EXISTS)
- Test all migrations locally before deployment
- Implement checksum validation to prevent accidental migration file changes
- Provide rollback capability for non-destructive migrations
- Document breaking changes clearly in migration files
- Run migrations in transaction to ensure atomicity

---

### Risk 5: Backward Compatibility Break
**Severity:** High
**Probability:** Low

**Description:** Existing hardcoded agent setup might break if agent loader fails or database is unavailable.

**Mitigation:**
- Implement graceful fallback to hardcoded config
- Test with database unavailable scenario
- Provide clear error messages if database init fails
- Allow optional database configuration (database_url env var)
- If database unavailable, log warning but continue with hardcoded agents

---

### Risk 6: Credential Corruption or Loss
**Severity:** High
**Probability:** Low

**Description:** If encryption fails or database is corrupted, credentials might become inaccessible.

**Mitigation:**
- Validate encryption round-trip in unit tests
- Use authenticated encryption (GCM) to detect corruption
- Backup database regularly (daily snapshots)
- Test recovery from backup
- Implement credential versioning (multiple credentials per provider)
- If decryption fails, graceful error with fallback (e.g., request credential re-entry)

---

### Risk 7: Dependency Vulnerabilities
**Severity:** Medium
**Probability:** Medium

**Description:** New dependencies (drizzle-orm, drizzle-kit) might introduce security vulnerabilities.

**Mitigation:**
- Use stable, well-maintained dependencies (drizzle-orm is actively maintained)
- Enable Dependabot to monitor for vulnerability updates
- Regularly update dependencies
- Review dependency changelogs before major updates
- Use npm audit to detect known vulnerabilities
- Implement software composition analysis (SCA) in CI

---

## Effort Estimation

### Development Effort

| Phase | Component | Estimated Hours | Notes |
|-------|-----------|-----------------|-------|
| 1 | Drizzle Setup & Schema | 16 | Schema design, table definitions, indexes |
| 1 | Encryption Layer | 20 | AES-256-GCM implementation, key management, tests |
| 1 | Migration System | 24 | Runner, initial migrations, validation, rollback |
| 1 | Agent Loader | 16 | Database queries, deserialization, provider binding |
| 1 | Credential Manager | 12 | Retrieval, decryption, validation, error handling |
| 1 | Integration & Testing | 32 | E2E tests, backward compatibility, error scenarios |
| 1 | Documentation | 12 | Schema docs, migration guide, runbook |
| **Phase 1 Total** | | **132 hours** | ~4 weeks (1 engineer) |
| 2 | Runtime Agent Creation | 40 | API, validation, security checks |
| 2 | Credential Rotation | 16 | Rotation workflow, validation, provider reconfig |
| 2 | Audit Logging | 12 | Logging infrastructure, audit table, queries |
| **Phase 2 Total** | | **68 hours** | ~2 weeks (1 engineer) |
| 3 | Multi-Tenant Support | 32 | Credential isolation, access control |
| 3 | Key Rotation | 24 | Key derivation, reencryption, migration |
| 3 | CLI Tools | 20 | Credential management, schema inspection |
| **Phase 3 Total** | | **76 hours** | ~2.5 weeks (1 engineer) |

### Test Effort

| Category | Estimated Hours | Coverage |
|----------|-----------------|----------|
| Unit Tests | 24 | Encryption, database queries, migration runner |
| Integration Tests | 16 | Agent loading, provider init, end-to-end |
| Performance Tests | 8 | Query latency, decryption overhead, startup time |
| Security Tests | 8 | Encryption key validation, credential leakage, auth tag verification |
| **Test Total** | **56 hours** | ~1.5 weeks |

### Documentation Effort

| Document | Estimated Hours |
|----------|-----------------|
| Schema Reference | 4 |
| Migration Guide | 4 |
| Encryption Strategy Guide | 4 |
| Runbook: Key Rotation | 2 |
| Runbook: Credential Management | 2 |
| API/Tool Documentation | 4 |
| Architecture Decision Records (ADR) | 4 |
| **Documentation Total** | **24 hours** |

### Total Effort (All Phases)
- **Development:** 276 hours (~7 weeks, 1 engineer)
- **Testing:** 56 hours (~1.5 weeks, 1 engineer)
- **Documentation:** 24 hours (~0.5 weeks, 1 engineer)
- **Code Review & QA:** 40 hours (~1 week, 1 engineer)
- **Total:** ~360 hours (~10 weeks, 1 engineer full-time)

### Resource Allocation
- **Lead Engineer:** Full-time (Weeks 1-4 Phase 1, then support)
- **QA/Testing:** Part-time (Parallel with development, Weeks 2-5)
- **Documentation:** Part-time (Ongoing, after each phase)
- **Review:** Part-time (Asynchronous code reviews)

---

## Implementation Checklist

### Phase 1: Core Infrastructure

**Week 1: Database & Encryption**
- [ ] Create `packages/mastra-engine/src/database/` directory structure
- [ ] Define Drizzle schema in `schema.ts`
  - [ ] agents table
  - [ ] providers table
  - [ ] credentials table
  - [ ] agent_providers table
  - [ ] provider_accounts table
  - [ ] migrations table
- [ ] Create encryption utilities in `encryption/index.ts`
  - [ ] encrypt() function with AES-256-GCM
  - [ ] decrypt() function with tag verification
  - [ ] Key validation and derivation
- [ ] Create key manager in `encryption/key-manager.ts`
  - [ ] Load key from ENCRYPTION_MASTER_KEY env var
  - [ ] Validate 32-byte length
  - [ ] Handle missing key gracefully
- [ ] Create database client in `database/client.ts`
  - [ ] Initialize SQLite connection
  - [ ] Apply migrations on startup
  - [ ] Handle connection errors
- [ ] Write unit tests
  - [ ] Encryption round-trip (plaintext → encrypt → decrypt → plaintext)
  - [ ] Different credential lengths
  - [ ] Key validation (invalid length, invalid format)
  - [ ] Database connection and table existence

**Week 2: Migration System**
- [ ] Create migration runner in `database/migrations/runner.ts`
  - [ ] Detect pending migrations
  - [ ] Execute in order
  - [ ] Track in database
  - [ ] Validate checksums
  - [ ] Atomic transactions
- [ ] Create initial migrations
  - [ ] `001_initial_schema.ts` — create all core tables
  - [ ] `002_add_audit_fields.ts` — add created_by, updated_at
  - [ ] `003_add_encryption_validation.ts` — add algorithm, tag columns
- [ ] Add migration types in `database/types.ts`
- [ ] Write migration tests
  - [ ] Empty database → migrations apply successfully
  - [ ] Migrations idempotent (run twice, same result)
  - [ ] Rollback works for each migration
  - [ ] Checksum validation prevents modification

**Week 3: Agent Loader & Credential Manager**
- [ ] Create agent loader in `agent-loader/index.ts`
  - [ ] Query agents from database on startup
  - [ ] Deserialize agent configuration
  - [ ] Handle empty database gracefully
  - [ ] Support fallback to hardcoded agents
- [ ] Create credential manager in `providers/credential-manager.ts`
  - [ ] Query credentials by provider and agent
  - [ ] Decrypt credentials transparently
  - [ ] Validate decryption (check auth tag)
  - [ ] Cache recently-decrypted credentials (optional optimization)
  - [ ] Error handling (missing credentials, decryption failure)
- [ ] Update provider factory in `providers/provider-factory.ts`
  - [ ] Load Discord token from database credentials
  - [ ] Load Email (IMAP/SMTP) credentials from database
  - [ ] Fall back to environment variables if database unavailable
- [ ] Update `create-forge-agent.ts`
  - [ ] Call agent loader to initialize from database
  - [ ] Initialize encryption layer
  - [ ] Apply migrations before loading agents
  - [ ] Error messages if database init fails
- [ ] Update `apps/forge/src/main.ts`
  - [ ] Initialize database client
  - [ ] Initialize encryption
  - [ ] Load agents from database instead of hardcoded creation
  - [ ] Maintain backward compatibility (hardcoded agents as fallback)

**Week 4: Integration & Testing**
- [ ] Create end-to-end tests
  - [ ] Empty database → agent from database functions correctly
  - [ ] Discord provider init with database credentials
  - [ ] Email provider init with database credentials
  - [ ] Internal chat provider (no credentials needed)
  - [ ] Hardcoded agents still work (fallback scenario)
  - [ ] Multiple agents with different providers
- [ ] Test error scenarios
  - [ ] Database unavailable → fallback to hardcoded
  - [ ] Missing encryption key → graceful error
  - [ ] Corrupted credentials → decryption failure → error
  - [ ] Schema mismatch → migration fails → clear error
- [ ] Test backward compatibility
  - [ ] Disable database via env var → use hardcoded agents
  - [ ] Disable encryption via flag → store plaintext (for testing only)
  - [ ] Old agent configs still load
- [ ] Load test (optional)
  - [ ] 100+ agents in database
  - [ ] Startup time < 2 seconds
  - [ ] Credential lookup < 100ms
- [ ] Documentation
  - [ ] Write schema reference document
  - [ ] Write migration guide
  - [ ] Write encryption strategy document
  - [ ] Add inline code comments for complex logic
  - [ ] Create runbook for emergency key rotation
- [ ] Code review
  - [ ] Security review of encryption implementation
  - [ ] Performance review of database queries
  - [ ] API review of public functions/types
  - [ ] Test coverage review (aim for >85%)

---

## Appendices

### A. Example Environment Variables

```bash
# .env (development)
ENCRYPTION_MASTER_KEY=base64_encoded_32_byte_key_here
DATABASE_URL=file:./agent-system.db

# .env (production - via AWS Secrets Manager or similar)
# Never commit to version control
ENCRYPTION_MASTER_KEY=<from-secrets-manager>
DATABASE_URL=<from-secrets-manager>
```

### B. Example: Creating an Agent in Database

```typescript
// Pseudocode for manual database insert or API call
const agentId = await generateId(); // CUID

await db.insert(agents).values({
  id: agentId,
  name: 'Sales Agent',
  description: 'Handles customer inquiries',
  instructions: 'You are a helpful sales agent...',
  model_id: 'openai-codex/gpt-5.4',
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Add Discord provider
const discordCredential = await credentialManager.create({
  provider_id: 'discord',
  credential_type: 'bot_token',
  plaintext_value: 'discord_bot_token_xyz',
});

await db.insert(agent_providers).values({
  id: await generateId(),
  agent_id: agentId,
  provider_id: 'discord',
  provider_config_json: JSON.stringify({
    allowedChannelIds: ['123456789'],
    respondToMentionsOnly: false,
  }),
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});
```

### C. Example: Encryption/Decryption Code

```typescript
// Encryption
const plaintext = 'discord_bot_token_xyz';
const key = Buffer.from(process.env.ENCRYPTION_MASTER_KEY!, 'base64');
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

let encrypted = cipher.update(plaintext, 'utf8', 'hex');
encrypted += cipher.final('hex');
const tag = cipher.getAuthTag();

const stored = {
  encrypted_value: Buffer.from(encrypted, 'hex').toString('base64'),
  iv: iv.toString('base64'),
  tag: tag.toString('base64'),
};

// Decryption
const key = Buffer.from(process.env.ENCRYPTION_MASTER_KEY!, 'base64');
const iv = Buffer.from(stored.iv, 'base64');
const encryptedBuffer = Buffer.from(stored.encrypted_value, 'base64');
const tag = Buffer.from(stored.tag, 'base64');

const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(tag);

let plaintext = decipher.update(encryptedBuffer, undefined, 'utf8');
plaintext += decipher.final('utf8'); // Throws if tag invalid

console.log(plaintext); // 'discord_bot_token_xyz'
```

### D. Glossary

| Term | Definition |
|------|-----------|
| **Agent** | Autonomous entity that executes tasks via communication providers |
| **Credential** | Sensitive data (token, password) for provider authentication |
| **Encryption Key** | Master key used to encrypt/decrypt all credentials |
| **Master Key** | Single ENCRYPTION_MASTER_KEY used by entire system |
| **Provider** | Communication channel (Discord, Email, Internal Chat) |
| **GCM** | Galois/Counter Mode (authenticated encryption mode) |
| **IV** | Initialization Vector (random per encryption) |
| **Auth Tag** | Authentication tag for AEAD (verifies ciphertext integrity) |
| **Migration** | Versioned schema change applied atomically |
| **Drizzle ORM** | Type-safe SQL query builder with migrations |

### E. References & Further Reading

- [OWASP: Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [Node.js Crypto Documentation](https://nodejs.org/api/crypto.html)
- [AES-256-GCM Specification (NIST SP 800-38D)](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [OWASP: Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

---

**Document End**

---

### Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-15 | Technical Analysis | Initial PRD - comprehensive feature specification with schema, encryption strategy, and implementation roadmap |
