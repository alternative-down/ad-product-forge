/**
 * Unit tests for coolify/provider-config.ts.
 * getProviderConfig, getApplicationsBaseDomain.
 * Zero prior coverage.
 */
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  getProviderConfig,
  getApplicationsBaseDomain,
  type ProviderConfig,
} from './provider-config';
import { ServerSchema } from './schemas';

// ─── getProviderConfig ────────────────────────────────────────────────────────

describe('getProviderConfig', () => {
  it('returns full ProviderConfig from integrations', async () => {
    const integrations = {
      getCoolifyConfig: vi.fn().mockResolvedValue({
        baseUrl: 'https://coolify.example.com/',
        adminToken: 'tok-abc',
        serverId: 'srv-1',
        destinationId: 'dest-1',
        applicationsBaseDomain: 'app.example.com',
      }),
    };

    const result = await getProviderConfig(integrations as any);

    expect(result.baseUrl).toBe('https://coolify.example.com/api/v1');
    expect(result.adminToken).toBe('tok-abc');
    expect(result.serverId).toBe('srv-1');
    expect(result.destinationId).toBe('dest-1');
    expect(result.applicationsBaseDomain).toBe('app.example.com');
  });

  it('strips trailing slash from baseUrl', async () => {
    const integrations = {
      getCoolifyConfig: vi.fn().mockResolvedValue({
        baseUrl: 'https://coolify.example.com/',
        adminToken: 'tok',
        serverId: 'srv',
        destinationId: 'dest',
        applicationsBaseDomain: null,
      }),
    };

    const result = await getProviderConfig(integrations as any);

    expect(result.baseUrl).toBe('https://coolify.example.com/api/v1');
  });

  it('baseUrl replace only removes at most one trailing slash', async () => {
    // replace(/\\/$/, '') is greedy only on the last char, not on all slashes
    const integrations = {
      getCoolifyConfig: vi.fn().mockResolvedValue({
        baseUrl: 'https://coolify.example.com///',
        adminToken: 'tok',
        serverId: 'srv',
        destinationId: 'dest',
        applicationsBaseDomain: null,
      }),
    };

    const result = await getProviderConfig(integrations as any);

    // Only one slash is removed: 'https://coolify.example.com///' → 'https://coolify.example.com//' + '/api/v1'
    expect(result.baseUrl).toBe('https://coolify.example.com///api/v1');
  });

  it('applies normalizeDomainHost to applicationsBaseDomain', async () => {
    const integrations = {
      getCoolifyConfig: vi.fn().mockResolvedValue({
        baseUrl: 'https://coolify.io',
        adminToken: 'tok',
        serverId: 'srv',
        destinationId: 'dest',
        applicationsBaseDomain: '.my-domain.io',
      }),
    };

    const result = await getProviderConfig(integrations as any);

    expect(result.applicationsBaseDomain).toBe('my-domain.io');
  });

  it('throws when getCoolifyConfig returns null (no integration configured)', async () => {
    const integrations = {
      getCoolifyConfig: vi.fn().mockResolvedValue(null),
    };

    await expect(getProviderConfig(integrations as any)).rejects.toThrow(
      'Coolify integration requires a configured admin connection',
    );
  });
});

// ─── getApplicationsBaseDomain ─────────────────────────────────────────────

describe('getApplicationsBaseDomain — happy path', () => {
  it('uses provided serverUuid to fetch server', async () => {
    const requestJson = vi.fn().mockResolvedValue({
      data: { uuid: 'srv-1', wildcard_domain: '*.deploy.example.com' },
    });
    const getDefaultServer = vi.fn();

    const result = await getApplicationsBaseDomain(
      requestJson as any,
      getDefaultServer as any,
      'srv-1',
    );

    expect(requestJson).toHaveBeenCalledWith('GET', '/servers/srv-1');
    expect(result).toBe('*.deploy.example.com');
  });

  it('uses getDefaultServer when no serverUuid provided', async () => {
    const requestJson = vi.fn();
    const getDefaultServer = vi.fn().mockResolvedValue({
      uuid: 'default-srv',
      wildcard_domain: 'default.coolify.app',
    });

    const result = await getApplicationsBaseDomain(requestJson as any, getDefaultServer as any);

    expect(getDefaultServer).toHaveBeenCalled();
    expect(result).toBe('default.coolify.app');
  });

  it('applies normalizeDomainHost to wildcard_domain', async () => {
    const requestJson = vi.fn().mockResolvedValue({
      data: { uuid: 'srv', wildcard_domain: 'https://app.example.com/path' },
    });
    const getDefaultServer = vi.fn();

    const result = await getApplicationsBaseDomain(
      requestJson as any,
      getDefaultServer as any,
      'srv',
    );

    expect(result).toBe('app.example.com');
  });

  it('applies normalizeDomainHost to strip leading dot from wildcard_domain', async () => {
    const requestJson = vi.fn().mockResolvedValue({
      data: { uuid: 'srv', wildcard_domain: '.wildcard.example.com' },
    });
    const getDefaultServer = vi.fn();

    const result = await getApplicationsBaseDomain(
      requestJson as any,
      getDefaultServer as any,
      'srv',
    );

    expect(result).toBe('wildcard.example.com');
  });
});

describe('getApplicationsBaseDomain — error handling', () => {
  it('throws when wildcard_domain is null after normalizeDomainHost', async () => {
    const requestJson = vi.fn().mockResolvedValue({
      data: { uuid: 'srv', wildcard_domain: null },
    });
    const getDefaultServer = vi.fn();

    await expect(
      getApplicationsBaseDomain(requestJson as any, getDefaultServer as any, 'srv'),
    ).rejects.toThrow('Failed to resolve Coolify applications base domain:');
  });

  it('wraps requestJson errors into descriptive message', async () => {
    const requestJson = vi.fn().mockRejectedValue(new Error('network timeout'));
    const getDefaultServer = vi.fn();

    await expect(
      getApplicationsBaseDomain(requestJson as any, getDefaultServer as any, 'srv'),
    ).rejects.toThrow('network timeout');
  });

  it('throws when server data has no wildcard_domain key', async () => {
    const requestJson = vi.fn().mockResolvedValue({
      data: { uuid: 'srv' },
    });
    const getDefaultServer = vi.fn();

    await expect(
      getApplicationsBaseDomain(requestJson as any, getDefaultServer as any, 'srv'),
    ).rejects.toThrow('Failed to resolve Coolify applications base domain:');
  });

  it('throws when extractServer gets bare object with null wildcard_domain', async () => {
    const requestJson = vi.fn().mockResolvedValue({ wildcard_domain: null });
    const getDefaultServer = vi.fn();

    await expect(
      getApplicationsBaseDomain(requestJson as any, getDefaultServer as any, 'srv'),
    ).rejects.toThrow('Failed to resolve Coolify applications base domain:');
  });
});
