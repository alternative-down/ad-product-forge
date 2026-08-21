/**
 * Typed Error subclasses for the admin/read-model/helpers-schedule-crypto module
 * (Pattern L, D52 #6502 batch 38).
 */
export class CredentialsJsonParseError extends Error {
  readonly code = 'CREDENTIALS_JSON_PARSE_ERROR' as const;
  readonly cause: string;
  constructor(cause: string) {
    super(`Failed to parse credentials JSON: ${cause}`);
    this.name = 'CredentialsJsonParseError';
    this.cause = cause;
  }
}
