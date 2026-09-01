/**
 * Configuração de Banco de Dados (libsql) - APP
 *
 * Define apenas o path do banco de dados da aplicação.
 * Configurações de libsql e Turso são gerenciadas pelo client.ts
 */

import fs from 'node:fs';
import 'node:process';
import path from 'node:path';

import { parseEnv } from '../config/env';

/**
 * Path da aplicação: agents.db dentro do diretório de dados do Forge.
 * Resolved via the centralized env schema (FORGE_DATA_PATH, defaults to './data').
 * Closes #6705.
 */
export function getAppDatabasePath(): string {
  const dataPath = parseEnv().FORGE_DATA_PATH;
  const resolvedDataPath = path.resolve(process.cwd(), dataPath);

  fs.mkdirSync(resolvedDataPath, { recursive: true });

  return path.join(resolvedDataPath, 'agents.db');
}
