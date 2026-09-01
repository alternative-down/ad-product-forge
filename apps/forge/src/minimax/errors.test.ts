/**
 * Tests for Pattern L typed Errors in minimax module (D52 #6628 batch 2).
 *
 * Each test verifies:
 *   1. The thrown error is an instanceof the typed Error class
 *   2. The error code matches the expected discriminator
 *   3. The message text is preserved verbatim for backward compatibility
 *   4. Domain fields are exposed on the error for downstream consumers
 *
 * See apps/forge/src/minimax/errors.ts.
 *
 * Coverage note: combines Aldric's D52 cycle 41 batch (8 classes) with
 * the 2 classes (MiniMaxApiKeyNotSetError, MiniMaxIntegrationNotConfiguredError)
 * added by Varek in D52 #6646 — the file was consolidated during rebase.
 */

import { describe, expect, it } from 'vitest';

import {
  MiniMaxApiCallError,
  MiniMaxApiKeyNotSetError,
  MiniMaxFileDownloadError,
  MiniMaxFilesystemRequiredError,
  MiniMaxIntegrationNotConfiguredError,
  MiniMaxReferenceImageError,
  MiniMaxVideoGenerationFailedError,
  MiniMaxVideoGenerationTimeoutError,
  MiniMaxVideoStatusError,
  MiniMaxVoiceListError,
} from './errors';

describe('minimax/errors — Pattern L typed Errors (D52 #6628 batch 2)', () => {
  it('MiniMaxFilesystemRequiredError preserves verbatim message', () => {
    const error = new MiniMaxFilesystemRequiredError();
    expect(error).toBeInstanceOf(MiniMaxFilesystemRequiredError);
    expect(error.code).toBe('MINIMAX_FILESYSTEM_REQUIRED');
    expect(error.message).toBe('MiniMax tools require a workspace filesystem');
  });

  it('MiniMaxFileDownloadError captures status', () => {
    const error = new MiniMaxFileDownloadError(404);
    expect(error).toBeInstanceOf(MiniMaxFileDownloadError);
    expect(error.code).toBe('MINIMAX_FILE_DOWNLOAD');
    expect(error.status).toBe(404);
    expect(error.message).toBe('MiniMax file download failed with status 404');
  });

  it('MiniMaxReferenceImageError captures filePath', () => {
    const error = new MiniMaxReferenceImageError('/tmp/photo.bmp');
    expect(error).toBeInstanceOf(MiniMaxReferenceImageError);
    expect(error.code).toBe('MINIMAX_REFERENCE_IMAGE');
    expect(error.filePath).toBe('/tmp/photo.bmp');
    expect(error.message).toBe('Reference image must be an image file: /tmp/photo.bmp');
  });

  describe('MiniMaxVideoStatusError', () => {
    it('uses default message when none provided', () => {
      const error = new MiniMaxVideoStatusError();
      expect(error).toBeInstanceOf(MiniMaxVideoStatusError);
      expect(error.code).toBe('MINIMAX_VIDEO_STATUS');
      expect(error.message).toBe('Failed to query MiniMax video generation status');
    });

    it('uses custom message when provided', () => {
      const error = new MiniMaxVideoStatusError('custom status msg');
      expect(error.message).toBe('custom status msg');
    });
  });

  describe('MiniMaxVideoGenerationFailedError', () => {
    it('uses default message when none provided', () => {
      const error = new MiniMaxVideoGenerationFailedError();
      expect(error).toBeInstanceOf(MiniMaxVideoGenerationFailedError);
      expect(error.code).toBe('MINIMAX_VIDEO_GENERATION_FAILED');
      expect(error.message).toBe('MiniMax video generation failed');
    });

    it('uses custom message when provided', () => {
      const error = new MiniMaxVideoGenerationFailedError('model refused prompt');
      expect(error.message).toBe('model refused prompt');
    });
  });

  it('MiniMaxVideoGenerationTimeoutError preserves verbatim message', () => {
    const error = new MiniMaxVideoGenerationTimeoutError();
    expect(error).toBeInstanceOf(MiniMaxVideoGenerationTimeoutError);
    expect(error.code).toBe('MINIMAX_VIDEO_GENERATION_TIMEOUT');
    expect(error.message).toBe(
      'MiniMax video generation did not finish within the expected time window',
    );
  });

  describe('MiniMaxVoiceListError', () => {
    it('uses default message when none provided', () => {
      const error = new MiniMaxVoiceListError();
      expect(error).toBeInstanceOf(MiniMaxVoiceListError);
      expect(error.code).toBe('MINIMAX_VOICE_LIST');
      expect(error.message).toBe('Failed to list voices');
    });

    it('uses custom message when provided', () => {
      const error = new MiniMaxVoiceListError('rate limit exceeded');
      expect(error.message).toBe('rate limit exceeded');
    });
  });

  describe('MiniMaxApiCallError', () => {
    it('captures operation and preserves message verbatim', () => {
      const error = new MiniMaxApiCallError('textToSpeech', 'upstream timeout');
      expect(error).toBeInstanceOf(MiniMaxApiCallError);
      expect(error.code).toBe('MINIMAX_API_CALL');
      expect(error.operation).toBe('textToSpeech');
      expect(error.message).toBe('upstream timeout');
    });

    it('handles generateImage operation', () => {
      const error = new MiniMaxApiCallError('generateImage', 'image gen failed');
      expect(error.operation).toBe('generateImage');
    });
  });

  // ── Varek D52 #6646 additions — merged during rebase of #6652 ──
  describe('MiniMaxApiKeyNotSetError', () => {
    it('preserves verbatim message format', () => {
      const err = new MiniMaxApiKeyNotSetError();
      expect(err).toBeInstanceOf(MiniMaxApiKeyNotSetError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('MiniMaxApiKeyNotSetError');
      expect(err.code).toBe('MINIMAX_API_KEY_NOT_SET');
      expect(err.message).toBe('MINIMAX_API_KEY environment variable is not set');
      expect(err.stack).toBeDefined();
    });
  });

  describe('MiniMaxIntegrationNotConfiguredError', () => {
    it('preserves verbatim message format', () => {
      const err = new MiniMaxIntegrationNotConfiguredError();
      expect(err).toBeInstanceOf(MiniMaxIntegrationNotConfiguredError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('MiniMaxIntegrationNotConfiguredError');
      expect(err.code).toBe('MINIMAX_INTEGRATION_NOT_CONFIGURED');
      expect(err.message).toBe('MiniMax integration is not configured');
      expect(err.stack).toBeDefined();
    });
  });
});
