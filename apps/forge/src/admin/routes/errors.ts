
// ── Pattern L D51 #6502 batch 17: typed Errors for admin/routes/helpers.ts ──
// See apps/forge/src/admin/routes/helpers.ts for the source throw sites.

export class NormalizeJsonTextInvalidJsonError extends Error {
  readonly code = 'NORMALIZE_JSON_TEXT_INVALID_JSON' as const;
  readonly fieldName: string;
  readonly originalError: unknown;
  constructor(fieldName: string, originalError: unknown) {
    const originalMsg =
      originalError instanceof Error
        ? originalError.message
        : typeof originalError === 'string'
          ? originalError
          : String(originalError).replace(/^Error: /, '');
    super(`${fieldName} must be valid JSON: ${originalMsg}`);
    this.name = 'NormalizeJsonTextInvalidJsonError';
    this.fieldName = fieldName;
    this.originalError = originalError;
  }
}

export class NormalizeJsonTextInvalidShapeError extends Error {
  readonly code = 'NORMALIZE_JSON_TEXT_INVALID_SHAPE' as const;
  readonly fieldName: string;
  readonly expectedShape: 'array' | 'object';
  constructor(fieldName: string, expectedShape: 'array' | 'object') {
    super(`${fieldName} must be a JSON ${expectedShape}`);
    this.name = 'NormalizeJsonTextInvalidShapeError';
    this.fieldName = fieldName;
    this.expectedShape = expectedShape;
  }
}

export class ParseJsonBodyInvalidJsonError extends Error {
  readonly code = 'PARSE_JSON_BODY_INVALID_JSON' as const;
  readonly originalError: unknown;
  constructor(originalError: unknown) {
    const originalMsg =
      originalError instanceof Error
        ? originalError.message
        : typeof originalError === 'string'
          ? originalError
          : String(originalError).replace(/^Error: /, '');
    super(`Invalid JSON body: ${originalMsg}`);
    this.name = 'ParseJsonBodyInvalidJsonError';
    this.originalError = originalError;
  }
}
