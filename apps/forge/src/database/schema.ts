/**
 * Schema Drizzle ORM para libsql
 *
 * APLICAÇÃO (ad-product-forge):
 * - agents: Configuração de agentes
 * - agent_providers: Associação agente-provedor com credenciais
 *
 * IMPORTANTE:
 * - internal-chat é persistido no banco central da aplicação
 * - os demais providers continuam no módulo de comunicação do mastra-engine por enquanto
 * - Cada agente tem seu próprio banco de dados (path relativo a workspace)
 */

// Re-exports all tables, types, and relations from 11 domain modules.
//
// Previously this file had 22 named re-exports (11 values + 11 types) + 11
// `export *` for relations, each preceded by an `eslint-disable-next-line`
// directive for `reexport-check/no-unnecessary-reexports` — 33 disables
// total. See #5578 for the consolidation.
//
// The file-level disable below is intentional: this is a barrel
// aggregating multiple domain modules. Consumers (89 files, all using
// named imports) depend on the public surface. Tripwire test
// `no-database-reexport-tripwire.test.ts` enforces that `Database` is
// not exposed via this chain (regression for #5554).
/* eslint-disable reexport-check/no-unnecessary-reexports */

// ── Values + types from 11 domain modules ────────────────────────────────────
export * from './schema-agents.js';
export * from './schema-roles.js';
export * from './schema-llm.js';
export * from './schema-finance.js';
export * from './schema-config.js';
export * from './schema-integrations.js';
export * from './schema-chat.js';
export * from './schema-mcp.js';
export * from './schema-webhooks.js';
export * from './schema-knowledge.js';
export * from './schema-tickets.js';

// ── Relations (drizzle `relations()` definitions) ────────────────────────────
export * from './schema-agents-relations.js';
export * from './schema-chat-relations.js';
export * from './schema-config-relations.js';
export * from './schema-finance-relations.js';
export * from './schema-integrations-relations.js';
export * from './schema-knowledge-relations.js';
export * from './schema-llm-relations.js';
export * from './schema-mcp-relations.js';
export * from './schema-roles-relations.js';
export * from './schema-tickets-relations.js';
export * from './schema-webhooks-relations.js';
