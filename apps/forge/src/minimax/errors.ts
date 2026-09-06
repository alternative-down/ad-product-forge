/**
 * Typed Error subclasses for the minimax module (Pattern L, D50 cycle 2).
 *
 * Replaces 12 raw `throw new Error(...)` calls in tools.ts with typed Error
 * subclasses so consumers can use `err instanceof XError` instead of parsing
 * human-readable messages. See #6502.
 *
 * Pattern reference: apps/forge/src/schedules/errors.ts (D49 #6522),
 * apps/forge/src/communication/internal-chat-errors.ts (Pattern L).
 *
 * Migration impact: 12 literal `throw new Error(...)` calls in
 * apps/forge/src/minimax/tools.ts collapse to 8 typed Error classes.
 * Message format is preserved for backward compatibility with existing
 * tests and the `withToolErrorLogging` wrapper.
 */

export class MiniMaxFilesystemRequiredError extends Error {
  readonly code = 'MINIMAX_FILESYSTEM_REQUIRED' as const;
  constructor() {
    super('MiniMax tools require a workspace filesystem');
    this.name = 'MiniMaxFilesystemRequiredError';
  }
}

export class MiniMaxFileDownloadError extends Error {
  readonly code = 'MINIMAX_FILE_DOWNLOAD' as const;
  readonly status: number;
  constructor(status: number) {
    super(`MiniMax file download failed with status ${status}`);
    this.name = 'MiniMaxFileDownloadError';
    this.status = status;
  }
}

export class MiniMaxReferenceImageError extends Error {
  readonly code = 'MINIMAX_REFERENCE_IMAGE' as const;
  readonly filePath: string;
  constructor(filePath: string) {
    super(`Reference image must be an image file: ${filePath}`);
    this.name = 'MiniMaxReferenceImageError';
    this.filePath = filePath;
  }
}

export class MiniMaxVideoStatusError extends Error {
  readonly code = 'MINIMAX_VIDEO_STATUS' as const;
  constructor(message?: string) {
    super(message ?? 'Failed to query MiniMax video generation status');
    this.name = 'MiniMaxVideoStatusError';
  }
}

export class MiniMaxVideoGenerationFailedError extends Error {
  readonly code = 'MINIMAX_VIDEO_GENERATION_FAILED' as const;
  constructor(message?: string) {
    super(message ?? 'MiniMax video generation failed');
    this.name = 'MiniMaxVideoGenerationFailedError';
  }
}

export class MiniMaxVideoGenerationTimeoutError extends Error {
  readonly code = 'MINIMAX_VIDEO_GENERATION_TIMEOUT' as const;
  constructor() {
    super(
      'MiniMax video generation did not finish within the expected time window',
    );
    this.name = 'MiniMaxVideoGenerationTimeoutError';
  }
}

export class MiniMaxVoiceListError extends Error {
  readonly code = 'MINIMAX_VOICE_LIST' as const;
  constructor(message?: string) {
    super(message ?? 'Failed to list voices');
    this.name = 'MiniMaxVoiceListError';
  }
}

// Unexported in E9 — used only as the property type of MiniMaxApiCallError in this file (TS callers rely on inference).
type MiniMaxApiOperation =
  | 'textToSpeech'
  | 'generateImage'
  | 'createVideoGenerationTask'
  | 'retrieveFile';

export class MiniMaxApiCallError extends Error {
  readonly code = 'MINIMAX_API_CALL' as const;
  readonly operation: MiniMaxApiOperation;
  constructor(operation: MiniMaxApiOperation, message: string) {
    super(message);
    this.name = 'MiniMaxApiCallError';
    this.operation = operation;
  }
}

export class MiniMaxApiKeyNotSetError extends Error {
  readonly code = 'MINIMAX_API_KEY_NOT_SET' as const;
  constructor() {
    super('MINIMAX_API_KEY environment variable is not set');
    this.name = 'MiniMaxApiKeyNotSetError';
  }
}

export class MiniMaxIntegrationNotConfiguredError extends Error {
  readonly code = 'MINIMAX_INTEGRATION_NOT_CONFIGURED' as const;
  constructor() {
    super('MiniMax integration is not configured');
    this.name = 'MiniMaxIntegrationNotConfiguredError';
  }
}
