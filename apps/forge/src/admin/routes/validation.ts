/**
 * Schema validation utilities for admin routes
 */
import { forgeDebug } from './debug';
import type { ZodSchema } from 'zod';

export interface ValidationResult<T> {
  success: true;
  data: T;
}

export interface ValidationError {
  success: false;
  error: string;
}

/**
 * Safely parse request data with a Zod schema
 */
export function parseRequest<T>(
  schema: ZodSchema<T>,
  data: unknown
): ValidationResult<T> | ValidationError {
  try {
    const parsed = schema.parse(data);
    return { success: true, data: parsed };
  } catch (error) {
    forgeDebug({ scope: 'validation', level: 'error', message: '[validation] parseRequest failed', context: { error: error instanceof Error ? error.message : String(error) }});
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Validation failed',
    };
  }
}

/**
 * Parse query parameters from URLSearchParams
 */
export function parseQueryParams<T>(
  schema: ZodSchema<T>,
  searchParams: URLSearchParams
): ValidationResult<T> | ValidationError {
  try {
    const data: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      data[key] = value;
    });
    const parsed = schema.parse(data);
    return { success: true, data: parsed };
  } catch (error) {
    forgeDebug({ scope: 'validation', level: 'error', message: '[validation] parseQueryParams failed', context: { error: error instanceof Error ? error.message : String(error) }});
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Query validation failed',
    };
  }
}