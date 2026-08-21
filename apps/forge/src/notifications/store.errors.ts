/**
 * Typed Error subclasses for the notifications/store module (Pattern L, D52 #6502 batch 37).
 */
export class NotificationContentTooLongError extends Error {
  readonly code = 'NOTIFICATION_CONTENT_TOO_LONG' as const;
  readonly actualLength: number;
  readonly maxLength: number;
  constructor(actualLength: number, maxLength: number) {
    super(`createNotification content length ${actualLength} exceeds max ${maxLength}`);
    this.name = 'NotificationContentTooLongError';
    this.actualLength = actualLength;
    this.maxLength = maxLength;
  }
}
