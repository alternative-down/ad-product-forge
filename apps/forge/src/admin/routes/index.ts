/**
 * Admin Routes Module
 * 
 * Extracted schemas and utilities from the monolithic routes.ts
 */

export * from './schemas.js';
export * from './validation.js';

/**
 * Build a JSON response object
 */
export function jsonResponse(body: unknown, status = 200) {
  return { status, body };
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