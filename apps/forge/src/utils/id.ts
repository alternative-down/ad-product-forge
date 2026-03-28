/**
 * Centralized ID generation using Node.js built-in crypto.
 * crypto.randomUUID() is available in Node.js 14.17+ and is ESM-compatible.
 */
export function createId(): string {
  return crypto.randomUUID();
}
