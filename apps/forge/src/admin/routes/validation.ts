/**
 * Schema validation utilities for admin routes
 */
import { forgeDebug } from './debug';
import { errorMsg } from '../../agents/error-formatting';
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
  data: unknown,
): ValidationResult<T> | ValidationError {
  try {
    const parsed = schema.parse(data);
    return { success: true, data: parsed };
  } catch (err) {
    forgeDebug({
      scope: 'validation',
      level: 'error',
      message: '[validation] parseRequest failed',
      context: { error: errorMsg(err) },
    });
    return {
      success: false,
      error: errorMsg(err),
    };
  }
}

/**
 * Parse query parameters from URLSearchParams
 */
export function parseQueryParams<T>(
  schema: ZodSchema<T>,
  searchParams: URLSearchParams,
): ValidationResult<T> | ValidationError {
  try {
    const data: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      data[key] = value;
    });
    const parsed = schema.parse(data);
    return { success: true, data: parsed };
  } catch (err) {
    forgeDebug({
      scope: 'validation',
      level: 'error',
      message: '[validation] parseQueryParams failed',
      context: { error: errorMsg(err) },
    });
    return {
      success: false,
      error: errorMsg(err),
    };
  }
}
