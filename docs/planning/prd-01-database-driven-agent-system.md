# PRD — Database-Driven Agent System

**Status:** Planning - Technical Analysis & Design
**Date:** 2026-03-15
**Version:** 1.0
**Feature ID:** CORE-001

> **Note:** This is a personal solo-developer project. Requirements focus on functionality and simplicity, not enterprise-grade robustness.

---

## Executive Summary

**Objective:** Transform the agent platform from static, hardcoded agent configuration to a dynamic, database-backed agent creation and management system that enables runtime agent spawning and credential management.

**Problem:** Currently, agents are created at startup with fixed configuration loaded from environment variables. This prevents dynamic agent creation and makes credential management inflexible.

**Solution:** Implement SQLite with Drizzle ORM as the persistence layer for:
- Agent configurations and metadata
- Communication provider credentials and settings
- Agent-to-provider mappings
- Encrypted sensitive data storage

**Value Proposition:**
- Enable runtime agent creation without application restart
- Secure sensitive credential storage with transparent encryption
- Provide foundation for advanced features (agent hiring, specialist agents)
- Simple, single-instance deployment model

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

### Pain Points
1. **Scalability Limitation:** Cannot dynamically create agents without modifying code and restarting
2. **Credential Security:** Credentials in environment variables are not encrypted at rest
3. **Configuration Inflexibility:** Cannot bind different providers to different agents at runtime
4. **Scattered Configuration:** Agent configuration scattered across environment, code, and per-agent databases

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
- Store agent metadata in database: ID, name, description, model reference
- Store agent instructions (system prompt/rules)
- Support multiple agents per system
- Associate agents with communication providers
- Track agent creation/modification timestamps

#### FR2: Provider Credential Management
- Store provider credentials: API tokens, usernames, passwords, connection strings
- Support multiple credential sets per provider type
- Associate credentials with specific agents

#### FR3: Provider Configuration Schema
- Store provider-specific settings (API endpoints, ports, TLS settings)
- Support provider-specific metadata (e.g., Discord channel ID allowlists, email BCC addresses)
- Store provider settings per agent

#### FR4: Encryption & Security
- Encrypt sensitive fields before database storage
- Transparent decryption on retrieval
- Prevent accidental credential logging
- Support encrypted fields: API tokens, passwords, connection strings, OAuth credentials

#### FR5: Runtime Agent Instantiation
- Load agent configuration from database at startup
- Create agent instances from database configuration
- Enable fallback to hardcoded config if database unavailable

#### FR6: Provider Integration
- Load communication provider credentials from database
- Initialize providers with persisted credentials at startup
- Support changing provider credentials without code changes
- Maintain compatibility with existing provider interfaces (Discord, Email)

### Non-Functional Requirements

#### NFR1: Security
- Encryption key managed securely (environment variable)
- Encryption/decryption overhead < 10ms per operation
- No sensitive data logged by default

#### NFR2: Performance
- Agent lookup from database < 50ms
- Credential retrieval/decryption < 100ms
- Database initialization < 2 seconds at startup

#### NFR3: Reliability
- Graceful degradation if encryption key unavailable
- Transaction support for atomic credential updates
- Schema integrity validation on startup

#### NFR4: Usability
- Clear error messages for configuration/credential issues
- Type-safe APIs using TypeScript/Zod validation
- Intuitive database schema matching domain concepts

#### NFR5: Maintainability
- Clear separation between encryption layer and business logic
- Drizzle ORM provides type safety and query generation
- Documented schema and field purposes

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
│  ┌──────────────────┐     │ │ │ │ │                │ │ │ │ │
│  │ Encryption Layer │────▶│ │ │ │ └────────────────┘ │ │ │ │
│  │  (encrypt/decrypt)     │ │ │ └──────────────────┘ │ │ │
│  └──────────────────┘     │ │ └────────────────────┘ │ │
│                          │ └──────────────────────────┘ │
│         ▲                 │                              │
│         │                 │  Drizzle ORM               │
│  ┌──────────────────┐     │  (Query Builder + Schema)   │
│  │ Agent Loader     │────▶│                              │
│  │  (Runtime Init)  │     └──────────────────────────────┘
│  └──────────────────┘
│         │
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
- Provide typed query builders

#### 2. **Encryption Layer** (`packages/mastra-engine/src/encryption/`)
- Load encryption key from environment
- Provide encrypt/decrypt utilities
- Support AES-256-GCM encryption

#### 3. **Agent Loader** (`packages/mastra-engine/src/agent-loader/`)
- Query database for agents and providers at startup
- Initialize encryption layer
- Create agent instances using database configuration
- Fallback to hardcoded configuration if database unavailable

#### 4. **Provider Credential Manager** (`packages/mastra-engine/src/providers/credential-manager.ts`)
- Load and decrypt provider credentials
- Manage credential lifecycle (create, update, revoke)
- Validate credentials before provider initialization

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
Agent needs provider credential
    │
    ▼
Agent Registry lookup (agent_id → agent)
    │
    ├─→ Get associated providers (agent_providers table)
    │
    ├─→ Load credentials for each provider
    │
    ├─→ Decrypt sensitive fields
    │
    └─→ Return configured provider instance
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

-- Communication provider definitions
CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,           -- e.g., 'discord', 'email'
  base_config TEXT,              -- JSON, non-sensitive settings
  created_at INTEGER NOT NULL
);

-- Agent-to-provider associations
CREATE TABLE agent_providers (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  provider_config TEXT,           -- Agent-specific provider config (JSON)
  created_at INTEGER NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (provider_id) REFERENCES providers(id),
  UNIQUE(agent_id, provider_id)
);

-- Encrypted credentials
CREATE TABLE credentials (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  credential_type TEXT NOT NULL,  -- e.g., 'api_token', 'password', 'oauth'
  encrypted_value TEXT NOT NULL,  -- Encrypted with encryption key
  metadata TEXT,                   -- JSON, non-sensitive metadata
  created_at INTEGER NOT NULL,
  FOREIGN KEY (provider_id) REFERENCES providers(id)
);
```

### Encryption Strategy

**Field Encryption:**
- Only `encrypted_value` in `credentials` table is encrypted
- All other fields are plain text (non-sensitive metadata, configuration)
- Encryption uses AES-256-GCM with PBKDF2-derived key from master key

**Key Management:**
- Master key loaded from `ENCRYPTION_KEY` environment variable at startup
- Key is 32 bytes (256 bits) for AES-256-GCM
- No key rotation support in Phase 1 (simple for solo developer)

**Decryption at Runtime:**
```typescript
const agentProviders = await getAgentProviders(agentId);
for (const ap of agentProviders) {
  const creds = await getAndDecryptCredentials(ap.provider_id);
  provider.initialize(creds);
}
```

---

## Implementation Plan

### Phase 1: Core Infrastructure (2 weeks)

#### Week 1: Database & Encryption
- [ ] Set up Drizzle ORM with SQLite
- [ ] Design and implement database schema
- [ ] Implement encryption/decryption layer
- [ ] Create migration system (basic SQL scripts)
- [ ] Add database initialization at startup

**Deliverables:**
- Database schema file
- Drizzle definitions and migrations
- Encryption utility functions
- Updated startup sequence

#### Week 2: Agent Loader & Provider Credential Manager
- [ ] Implement Agent Loader to read from database
- [ ] Implement Provider Credential Manager
- [ ] Create fallback to hardcoded config
- [ ] Add type-safe API for agent/credential queries
- [ ] Basic error handling and logging

**Deliverables:**
- Agent Loader module
- Credential Manager module
- Fallback mechanisms
- Type definitions (TypeScript interfaces)

### Phase 2: API & Testing (1.5 weeks)

#### Week 3: Runtime Agent Creation API
- [ ] Implement agent creation tool/endpoint
- [ ] Implement credential storage API
- [ ] Add input validation (Zod schemas)
- [ ] Implement agent deletion/update APIs
- [ ] Add basic admin tools for managing agents

**Deliverables:**
- Agent CRUD APIs
- Credential management APIs
- Zod validation schemas
- Basic admin CLI commands

#### Week 4: Testing & Fallback Verification
- [ ] Unit tests for encryption/decryption
- [ ] Integration tests for agent loading
- [ ] Test fallback to hardcoded config
- [ ] Test credential encryption/decryption
- [ ] Verify error scenarios

**Deliverables:**
- Test suite covering core functionality
- Documentation for manual testing
- Error handling examples

### Phase 3: Polish & Documentation (1 week)

#### Week 5: Documentation & Cleanup
- [ ] Document database schema and fields
- [ ] Document encryption strategy
- [ ] Document API signatures
- [ ] Add code comments to complex sections
- [ ] Migration guide for existing hardcoded setup

**Deliverables:**
- Schema documentation
- API documentation
- Migration guide
- Code comments

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
- Standard DevOps practice
- Works with `.env` file loading

**Future Enhancement:**
- Could migrate to encrypted key storage if needed

### 4. Fallback to Hardcoded Config
**Decision:** Keep hardcoded agent configuration as fallback

**Rationale:**
- Allows gradual migration from static to dynamic
- System works even if database is unavailable
- Reduces deployment risk

**Note:** In production use, you'd use database exclusively. Fallback is for transition period.

### 5. No Migration Versioning System
**Decision:** Simple SQL script migration approach (no version tracking)

**Rationale:**
- Solo developer, no complex deployment pipeline
- Simpler to understand and maintain
- Can track migrations via version control
- Easy to add versioning if needed later

### 6. No Key Rotation
**Decision:** No key rotation support in Phase 1

**Rationale:**
- Adds significant complexity
- Not critical for solo developer use case
- Can be added in future if needed

---

## Error Handling & Edge Cases

### Encryption Key Missing
- **Behavior:** Application refuses to start, clear error message
- **Recovery:** User must provide `ENCRYPTION_KEY` environment variable

### Database Unavailable
- **Behavior:** Fall back to hardcoded agent configuration
- **Recovery:** Fix database issue, restart application

### Credential Decryption Fails
- **Behavior:** Agent fails to initialize, clear error message
- **Recovery:** Verify encryption key matches, check credential storage

### Invalid Agent Configuration
- **Behavior:** Validation error during agent creation
- **Recovery:** User corrects input, retries

### Database Corruption
- **Behavior:** Clear error message on startup
- **Recovery:** Restore from backup or reinitialize database

---

## Testing Strategy

### Unit Tests
- Encryption/decryption functions
- Zod validation schemas
- Database query builders

### Integration Tests
- Agent loading from database
- Credential encryption/decryption lifecycle
- Provider initialization with persisted credentials
- Fallback to hardcoded config

### Manual Testing
- Verify agents load on startup
- Verify credentials are encrypted in database (cannot read raw)
- Create agent via API, verify in database
- Stop database, verify fallback works
- Change provider credentials, verify agent uses new ones

### Error Scenario Testing
- Missing encryption key
- Corrupted credential
- Invalid agent configuration
- Database query failures

---

## Success Metrics

1. **Functionality**
   - Agents load correctly from database on startup
   - Agents can be created at runtime without restart
   - Credentials are persisted and encrypted

2. **Security**
   - Credentials cannot be read from database in plain text
   - Encryption/decryption works correctly
   - No credentials logged accidentally

3. **Reliability**
   - System falls back gracefully if database unavailable
   - Clear error messages guide user to fix issues
   - No data corruption during normal use

4. **Developer Experience**
   - Easy to add new agents
   - Easy to rotate credentials
   - Clear API and documentation

---

## Dependencies

### Required
- `sqlite3` (or `better-sqlite3`) - Database driver
- `drizzle-orm` - TypeScript ORM
- `zod` - Input validation
- Node.js built-in `crypto` module

### Optional (Future)
- Migration CLI tools
- Database visualization tools
- Backup/restore utilities

---

## Future Enhancements

- Credential rotation with timestamp tracking
- Agent scheduling and recurring tasks
- Agent hiring (dynamic tool-based agent creation)
- Specialist agent support
- Basic audit logging for agent/credential changes
- Admin dashboard for managing agents and credentials

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Encryption key leaked | High - all credentials exposed | Use environment variable, secure server |
| Database corruption | Medium - agents fail to load | Fallback to hardcoded config, regular backups |
| Migration issues | Medium - schema mismatch | Test migrations carefully, keep SQL simple |
| Performance degradation | Low - encryption overhead | Monitor < 10ms per operation |

---

## Glossary

- **Agent:** An AI-powered entity that can execute tasks and communicate via providers
- **Provider:** A communication channel (Discord, Email, etc.) for agent interaction
- **Credential:** Sensitive authentication data (tokens, passwords) for a provider
- **Encryption Key:** Master key used to encrypt/decrypt credentials
- **Drizzle ORM:** TypeScript ORM for type-safe database queries
- **Migration:** Schema change script applied at startup

---

## Sign-Off

**Author:** Development Team
**Approved:** N/A (Personal Project)
**Last Updated:** 2026-03-15
