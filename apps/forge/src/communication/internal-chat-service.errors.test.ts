import { describe, expect, test } from 'vitest';
import {
  ReadsNotInitializedError,
  AccountNotFoundError,
  AttachmentNotFoundError,
} from './internal-chat-service.errors';

describe('communication/internal-chat-service.errors', () => {
  describe('ReadsNotInitializedError', () => {
    test('has expected name, code, and message', () => {
      const err = new ReadsNotInitializedError();
      expect(err.name).toBe('ReadsNotInitializedError');
      expect(err.code).toBe('READS_NOT_YET_INITIALIZED');
      expect(err.message).toBe('reads not yet initialized');
    });

    test('is instanceof Error and self', () => {
      const err = new ReadsNotInitializedError();
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ReadsNotInitializedError);
    });
  });

  describe('AccountNotFoundError', () => {
    test('has expected name, code, and message', () => {
      const err = new AccountNotFoundError('abc-123');
      expect(err.name).toBe('AccountNotFoundError');
      expect(err.code).toBe('ACCOUNT_NOT_FOUND');
      expect(err.message).toBe('Account not found by targetKey: abc-123');
      expect(err.targetKey).toBe('abc-123');
    });

    test('is instanceof Error and self', () => {
      const err = new AccountNotFoundError('x');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AccountNotFoundError);
    });
  });

  describe('AttachmentNotFoundError', () => {
    test('has expected name, code, and message', () => {
      const err = new AttachmentNotFoundError('report.pdf');
      expect(err.name).toBe('AttachmentNotFoundError');
      expect(err.code).toBe('ATTACHMENT_NOT_FOUND');
      expect(err.message).toBe('Attachment not found: report.pdf');
      expect(err.attachmentName).toBe('report.pdf');
    });

    test('is instanceof Error and self', () => {
      const err = new AttachmentNotFoundError('x');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AttachmentNotFoundError);
    });
  });

  describe('instanceof discrimination', () => {
    test('can discriminate between different error types', () => {
      const readsErr = new ReadsNotInitializedError();
      const accountErr = new AccountNotFoundError('x');
      const attachmentErr = new AttachmentNotFoundError('y');
      expect(readsErr).toBeInstanceOf(ReadsNotInitializedError);
      expect(readsErr).not.toBeInstanceOf(AccountNotFoundError);
      expect(accountErr).toBeInstanceOf(AccountNotFoundError);
      expect(accountErr).not.toBeInstanceOf(AttachmentNotFoundError);
      expect(attachmentErr).toBeInstanceOf(AttachmentNotFoundError);
      expect(attachmentErr).not.toBeInstanceOf(AccountNotFoundError);
    });
  });
});
