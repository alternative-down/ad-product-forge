import { describe, expect, it } from 'vitest';
import { NotificationContentTooLongError } from './store.errors';

describe('NotificationContentTooLongError', () => {
  it('preserves verbatim message', () => {
    const err = new NotificationContentTooLongError(1000, 500);
    expect(err).toBeInstanceOf(NotificationContentTooLongError);
    expect(err.name).toBe('NotificationContentTooLongError');
    expect(err.code).toBe('NOTIFICATION_CONTENT_TOO_LONG');
    expect(err.actualLength).toBe(1000);
    expect(err.maxLength).toBe(500);
    expect(err.message).toBe('createNotification content length 1000 exceeds max 500');
  });
});
