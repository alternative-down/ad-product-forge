/**
 * Configuração de Banco de Dados (libsql) - mastra-engine LIB
 *
 * Define paths e configurações para:
 * - Banco de comunicação (communication.db)
 * - Banco de cada agente no workspace (relativo a workspace)
 * Preparado para migração futura para Turso.
 */

import path from 'node:path';

/**
 * Path do banco de comunicação da lib: communication.db na raiz de mastra-engine
 * Usado pelo módulo de comunicação (local development)
 */
export function getCommunicationDatabasePath(): string {
  return 'file:./communication.db';
}

/**
 * Path de banco de agente dentro do workspace
 * Cada agente tem seu próprio banco (path relativo a workspace)
 *
 * @param workspaceBasePath - caminho base do workspace
 * @returns path relativo ao workspace para agents.db
 */
export function getAgentDatabasePath(workspaceBasePath: string): string {
  return path.join(workspaceBasePath, 'agents.db');
}

/**
 * Constrói URL de conexão libsql
 * Para local: file:path
 * Para Turso: https://...
 *
 * @param databasePath - caminho do banco de dados
 * @returns URL de conexão libsql
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
 * Token de autenticação Turso
 *
 * @returns token de auth ou undefined se não configurado
 */
export function getLibsqlToken(): string | undefined {
  return process.env.TURSO_AUTH_TOKEN;
}
