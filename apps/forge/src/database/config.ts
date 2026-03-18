/**
 * Configuração de Banco de Dados (libsql) - APP
 *
 * Define apenas o path do banco de dados da aplicação.
 * Configurações de libsql e Turso são gerenciadas pelo client.ts
 */

import path from 'node:path';

/**
 * Path da aplicação: agents.db na raiz da app
 */
export function getAppDatabasePath(): string {
  return path.resolve(process.cwd(), 'agents.db');
}
