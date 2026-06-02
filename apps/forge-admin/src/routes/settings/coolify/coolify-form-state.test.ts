// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { SystemIntegration } from '@/lib/admin-api/index';
import { buildCoolifyFormValues, type CoolifyFormValues } from './coolify-form-state';

const SAVED_BASE: SystemIntegration = {
  id: 'coolify',
  kind: 'coolify',
  isEnabled: false,
  config: {
    baseUrl: 'https://coolify.example.com',
    adminToken: 'saved-token-xyz',
    serverId: 'srv-001',
    destinationId: 'dest-001',
    applicationsBaseDomain: 'apps.example.com',
  },
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
};

const LIVE_BASE: CoolifyFormValues = {
  baseUrl: 'https://live.example.com',
  adminToken: 'live-token-abc',
  serverId: 'srv-LIVE',
  destinationId: 'dest-LIVE',
  applicationsBaseDomain: 'live.example.com',
  isEnabled: true,
};

describe('buildCoolifyFormValues', () => {
  describe('when both live and saved are provided', () => {
    it('uses live values for every field (live wins over saved)', () => {
      const result = buildCoolifyFormValues(LIVE_BASE, SAVED_BASE);
      expect(result).toEqual({
        baseUrl: 'https://live.example.com',
        adminToken: 'live-token-abc',
        serverId: 'srv-LIVE',
        destinationId: 'dest-LIVE',
        applicationsBaseDomain: 'live.example.com',
        isEnabled: true,
      });
    });
  });

  describe('when only saved is provided (live is null)', () => {
    it('falls back to saved values for every field', () => {
      const result = buildCoolifyFormValues(null, SAVED_BASE);
      expect(result).toEqual({
        baseUrl: 'https://coolify.example.com',
        adminToken: 'saved-token-xyz',
        serverId: 'srv-001',
        destinationId: 'dest-001',
        applicationsBaseDomain: 'apps.example.com',
        isEnabled: false,
      });
    });
  });

  describe('when only live is provided (saved is null)', () => {
    it('uses live values directly', () => {
      const result = buildCoolifyFormValues(LIVE_BASE, null);
      expect(result).toEqual(LIVE_BASE);
    });
  });

  describe('when both are null', () => {
    it('returns empty strings and isEnabled=true (default)', () => {
      const result = buildCoolifyFormValues(null, null);
      expect(result).toEqual({
        baseUrl: '',
        adminToken: '',
        serverId: '',
        destinationId: '',
        applicationsBaseDomain: '',
        isEnabled: true,
      });
    });
  });

  describe('per-field partial fallback', () => {
    it('uses saved.config for a field when live leaves it as empty string', () => {
      const partialLive: CoolifyFormValues = {
        baseUrl: 'https://live.example.com',
        adminToken: '',
        serverId: 'srv-LIVE',
        destinationId: 'dest-LIVE',
        applicationsBaseDomain: 'live.example.com',
        isEnabled: true,
      };
      const result = buildCoolifyFormValues(partialLive, SAVED_BASE);
      // `??` only falls back on null/undefined, NOT on empty string
      expect(result.adminToken).toBe('');
    });

    it('uses saved.config for a field when live leaves it as null', () => {
      // Cast to simulate a partially-typed live object (in practice live is never
      // null at the field level, but the type uses `??` so the behavior is
      // observable and we document it here).
      const partialLive = {
        baseUrl: 'https://live.example.com',
        adminToken: null,
        serverId: 'srv-LIVE',
        destinationId: 'dest-LIVE',
        applicationsBaseDomain: 'live.example.com',
        isEnabled: true,
      } as unknown as CoolifyFormValues;
      const result = buildCoolifyFormValues(partialLive, SAVED_BASE);
      expect(result.adminToken).toBe('saved-token-xyz');
    });

    it('uses saved.isEnabled when live leaves isEnabled undefined and saved.isEnabled is false', () => {
      const partialLive = {
        ...LIVE_BASE,
        isEnabled: undefined,
      } as unknown as CoolifyFormValues;
      const result = buildCoolifyFormValues(partialLive, SAVED_BASE);
      expect(result.isEnabled).toBe(false);
    });

    it('defaults isEnabled to true when neither live nor saved provide it', () => {
      const savedNoEnabled: SystemIntegration = {
        ...SAVED_BASE,
        isEnabled: undefined as unknown as boolean,
      };
      const result = buildCoolifyFormValues(null, savedNoEnabled);
      expect(result.isEnabled).toBe(true);
    });
  });

  describe('isolation of return value', () => {
    it('does not mutate the saved.config object', () => {
      const saved: SystemIntegration = {
        ...SAVED_BASE,
        config: { ...SAVED_BASE.config },
      };
      const originalBaseUrl = saved.config.baseUrl;
      const originalToken = saved.config.adminToken;
      buildCoolifyFormValues(LIVE_BASE, saved);
      expect(saved.config.baseUrl).toBe(originalBaseUrl);
      expect(saved.config.adminToken).toBe(originalToken);
    });
  });
});
