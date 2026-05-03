/**
 * Configuração de Banco de Dados (libsql) - APP
 *
 * Define apenas o path do banco de dados da aplicação.
 * Configurações de libsql e Turso são gerenciadas pelo client.ts
 */

import fs from 'node:fs';
import 'node:process';
import path from 'node:path';

/**
 * Path da aplicação: agents.db dentro do diretório de dados do Forge
 */
export function getAppDatabasePath(): string {
  const dataPath = process.env.FORGE_DATA_PATH ?? './data';
  const resolvedDataPath = path.resolve(process.cwd(), dataPath);

  fs.mkdirSync(resolvedDataPath, { recursive: true });

  return path.join(resolvedDataPath, 'agents.db');
}
