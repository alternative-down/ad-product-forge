/**
 * Configuração de Banco de Dados (libsql) - mastra-engine LIB
 *
 * Define paths para:
 * - Banco de comunicação (communication.db)
 * - Banco de cada agente no workspace (relativo a workspace)
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
