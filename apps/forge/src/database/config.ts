/**
 * Configuração de Banco de Dados (libsql)
 *
 * Define paths e configurações para o banco de dados SQLite via libsql.
 * Preparado para migração futura para Turso.
 */

import path from 'node:path';

/**
 * Path da aplicação: ./agents.db (raiz da aplicação)
 */
export function getAppDatabasePath(): string {
  return path.resolve(process.cwd(), 'agents.db');
}

/**
 * Path de workspace (agente): relativo a workspace
 * Usado pelo módulo de comunicação no mastra-engine
 */
export function getAgentDatabasePath(workspaceName: string): string {
  return path.resolve(workspaceName, 'agents.db');
}

/**
 * URL de conexão libsql
 * Para local: file:path
 * Para Turso: https://...
 */
export function getLibsqlUrl(databasePath: string): string {
  // Local development
  if (!process.env.TURSO_CONNECTION_URL) {
    return `file:${databasePath}`;
  }

  // Production with Turso
  return process.env.TURSO_CONNECTION_URL;
}

/**
 * Token de autenticação (para Turso)
 */
export function getLibsqlToken(): string | undefined {
  return process.env.TURSO_AUTH_TOKEN;
}
