import { describe, expect, test } from 'vitest';

import {
  WebhookIdempotencyConflictNoExistingEventError,
  WebhookRouteSecretRotationRouteNotFoundError,
} from './store.errors';

describe('webhooks/store errors', () => {
  describe('WebhookRouteSecretRotationRouteNotFoundError', () => {
    test('preserves verbatim message with route id', () => {
      const err = new WebhookRouteSecretRotationRouteNotFoundError('route-123');
      expect(err).toBeInstanceOf(WebhookRouteSecretRotationRouteNotFoundError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('WebhookRouteSecretRotationRouteNotFoundError');
      expect(err.code).toBe('WEBHOOK_ROUTE_SECRET_ROTATION_ROUTE_NOT_FOUND');
      expect(err.routeId).toBe('route-123');
      expect(err.message).toBe('Cannot rotate secret: route route-123 not found');
      expect(err.message).toContain('Cannot rotate secret:');
      expect(err.message).toContain('route-123');
    });
  });

  describe('WebhookIdempotencyConflictNoExistingEventError', () => {
    test('preserves verbatim message with route and key', () => {
      const err = new WebhookIdempotencyConflictNoExistingEventError('route-1', 'idem-key-abc');
      expect(err).toBeInstanceOf(WebhookIdempotencyConflictNoExistingEventError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('WebhookIdempotencyConflictNoExistingEventError');
      expect(err.code).toBe('WEBHOOK_IDEMPOTENCY_CONFLICT_NO_EXISTING_EVENT');
      expect(err.routeId).toBe('route-1');
      expect(err.idempotencyKey).toBe('idem-key-abc');
      expect(err.message).toBe(
        'Idempotency conflict but no existing event found for route=route-1 key=idem-key-abc',
      );
      expect(err.message).toContain('Idempotency conflict but no existing event found');
    });
  });
});
