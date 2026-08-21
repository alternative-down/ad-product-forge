import { describe, expect, test } from 'vitest';

import {
  CoolifyExtractCollectionError,
  CoolifyExtractItemError,
} from './helpers.errors';

describe('coolify/helpers errors', () => {
  describe('CoolifyExtractCollectionError', () => {
    test('preserves verbatim message with data snapshot', () => {
      const err = new CoolifyExtractCollectionError(JSON.stringify({ broken: true }));
      expect(err).toBeInstanceOf(CoolifyExtractCollectionError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('CoolifyExtractCollectionError');
      expect(err.code).toBe('COOLIFY_EXTRACT_COLLECTION');
      expect(err.dataSnapshot).toBe('{"broken":true}');
      expect(err.message).toBe('Failed to extract item from: {"broken":true}');
      expect(err.message).toContain('Failed to extract item from:');
    });

    test('handles string input', () => {
      const err = new CoolifyExtractCollectionError('"plain string"');
      expect(err.message).toBe('Failed to extract item from: "plain string"');
    });

    test('handles null input', () => {
      const err = new CoolifyExtractCollectionError('null');
      expect(err.message).toBe('Failed to extract item from: null');
    });
  });

  describe('CoolifyExtractItemError', () => {
    test('preserves verbatim message with data snapshot', () => {
      const err = new CoolifyExtractItemError(JSON.stringify({ invalid: 'x' }));
      expect(err).toBeInstanceOf(CoolifyExtractItemError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('CoolifyExtractItemError');
      expect(err.code).toBe('COOLIFY_EXTRACT_ITEM');
      expect(err.dataSnapshot).toBe('{"invalid":"x"}');
      expect(err.message).toBe('Failed to extract item from: {"invalid":"x"}');
    });

    test('distinguishes from CoolifyExtractCollectionError', () => {
      const collectionErr = new CoolifyExtractCollectionError('{"a":1}');
      const itemErr = new CoolifyExtractItemError('{"a":1}');
      expect(collectionErr).not.toBeInstanceOf(CoolifyExtractItemError);
      expect(itemErr).not.toBeInstanceOf(CoolifyExtractCollectionError);
    });
  });
});
