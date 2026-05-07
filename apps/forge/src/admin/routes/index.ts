/**
 * Admin Routes Module
 * 
 * Extracted schemas and utilities from the monolithic routes.ts
 */

// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- stable public API surface
export * from './schemas';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- stable public API surface
export * from './validation';

/**
 * Build a JSON response object
 */
export function jsonResponse(body: unknown, status = 200) {
  return { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: JSON.stringify(body) };
}

/**
 * Parse and validate JSON body against a schema
 */
import { z } from 'zod';

export function parseJsonBody<TSchema extends z.ZodTypeAny>(
  bodyText: string,
  schema: TSchema,
): z.infer<TSchema> {
  const parsed = bodyText.trim().length === 0 ? {} : JSON.parse(bodyText);
  return schema.parse(parsed);
}