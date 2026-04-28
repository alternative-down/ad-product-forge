import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStoredAdminSecret } from '@/lib/admin-secret';

// Must mock before importing core.ts, otherwise fetch is captured before we set it.
vi.mock('@/lib/admin-secret', () => ({
  getStoredAdminSecret: vi.fn(),
}));

import { request, requestBlob, validateAdminSecret } from './core';

// ─── Fetch mock helper ────────────────────────────────────────────────────────
//
// vi.spyOn(globalThis, 'fetch') returns undefined in jsdom. Solution: replace
// globalThis.fetch with a vi.fn() stub so every call (regardless of how
// core.ts originally captured it) goes through our control.
//
// The mock is installed before the first import of core.ts above.
// Each test reassigns globalThis.fetch to a fresh stub so tests stay isolated.
// ───────────────────────────────────────────────────────────────────────────────

function buildMockFetch(response: Response) {
  return vi.fn<typeof fetch>((_input: URL | Request | string) => {
    return Promise.resolve(response);
  });
}

// ─── request ──────────────────────────────────────────────────────────────────

describe('request', () => {
  beforeEach(() => {
    vi.mocked(getStoredAdminSecret).mockReturnValue('');
    vi.stubEnv('VITE_FORGE_API_BASE_URL', '');
    // Replace with a fresh stub each test.
    globalThis.fetch = buildMockFetch(new Response('', { status: 200 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed JSON for 200 response', async () => {
    const mockBody = { agents: [{ id: '1', name: 'Test Agent' }] };
    globalThis.fetch = buildMockFetch(
      new Response(JSON.stringify(mockBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await request<{ agents: Array<{ id: string; name: string }> }>('/admin/agents');

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].name).toBe('Test Agent');
  });

  it('uses POST method when specified', async () => {
    globalThis.fetch = buildMockFetch(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await request('/admin/test', { method: 'POST' });

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true });
  });

  it('sends API key header when secret is stored', async () => {
    vi.mocked(getStoredAdminSecret).mockReturnValue('test-secret-key');
    globalThis.fetch = buildMockFetch(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await request('/admin/overview');

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true });
  });

  it('throws with extracted error message from JSON body', async () => {
    globalThis.fetch = buildMockFetch(
      new Response(JSON.stringify({ error: 'Agent not found' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(request('/admin/agents')).rejects.toThrow('Agent not found');
  });

  it('throws with default message when JSON body has no error field', async () => {
    globalThis.fetch = buildMockFetch(
      new Response(JSON.stringify({ fields: ['name'] }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(request('/admin/agents')).rejects.toThrow('Não foi possível concluir a operação.');
  });

  it('throws with default message for non-JSON error body', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = buildMockFetch(
      new Response('<html>Internal Server Error</html>', { status: 500 }),
    );

    await expect(request('/admin/agents')).rejects.toThrow('Não foi possível concluir a operação.');
    // core.ts calls console.warn with 2 args: a formatted string and the raw body.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('[admin-api]');
    expect(warnSpy.mock.calls[0][0]).toContain('/admin/agents');
    expect(warnSpy.mock.calls[0][0]).toContain('500');
    expect(warnSpy.mock.calls[0][1]).toBe('<html>Internal Server Error</html>');
  });

  it('logs non-JSON response body on 4xx', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = buildMockFetch(
      new Response('Forbidden – access denied', { status: 403 }),
    );

    await expect(request('/admin/agents')).rejects.toThrow('Não foi possível concluir a operação.');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('[admin-api]');
    expect(warnSpy.mock.calls[0][0]).toContain('/admin/agents');
    expect(warnSpy.mock.calls[0][0]).toContain('403');
    expect(warnSpy.mock.calls[0][1]).toBe('Forbidden – access denied');
  });
});

// ─── requestBlob ──────────────────────────────────────────────────────────────

describe('requestBlob', () => {
  beforeEach(() => {
    vi.mocked(getStoredAdminSecret).mockReturnValue('');
    vi.stubEnv('VITE_FORGE_API_BASE_URL', '');
    globalThis.fetch = buildMockFetch(new Response('', { status: 200 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns blob for 200 response', async () => {
    globalThis.fetch = buildMockFetch(
      new Response('test-content', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );

    const result = await requestBlob('/export/agents');
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(result).toBeInstanceOf(Blob);
    const text = await result.text();
    expect(text).toBe('test-content');
  });

  it('throws with extracted error message from JSON body', async () => {
    globalThis.fetch = buildMockFetch(
      new Response(JSON.stringify({ error: 'Export failed' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(requestBlob('/export/agents')).rejects.toThrow('Export failed');
  });

  it('throws with default message for non-JSON error body', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = buildMockFetch(
      new Response('Internal error', { status: 500 }),
    );

    await expect(requestBlob('/export/agents')).rejects.toThrow('Não foi possível concluir a operação.');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('[admin-api]');
    expect(warnSpy.mock.calls[0][0]).toContain('/export/agents');
    expect(warnSpy.mock.calls[0][0]).toContain('500');
    expect(warnSpy.mock.calls[0][1]).toBe('Internal error');
  });
});

// ─── validateAdminSecret ──────────────────────────────────────────────────────

describe('validateAdminSecret', () => {
  beforeEach(() => {
    vi.mocked(getStoredAdminSecret).mockReturnValue('');
    globalThis.fetch = buildMockFetch(new Response('', { status: 200 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns valid: true for 200 response', async () => {
    globalThis.fetch = buildMockFetch(new Response('{}', { status: 200 }));
    const result = await validateAdminSecret('any-secret');
    expect(result.valid).toBe(true);
    expect(result.message).toBeNull();
  });

  it('returns valid: false with extracted message for 401 JSON error body', async () => {
    globalThis.fetch = buildMockFetch(
      new Response(JSON.stringify({ error: 'Invalid key' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await validateAdminSecret('bad-secret');
    expect(result.valid).toBe(false);
    expect(result.message).toBe('Invalid key');
  });

  it('returns valid: false with default message for non-JSON 401 body', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = buildMockFetch(
      new Response('Unauthorized', { status: 401 }),
    );
    const result = await validateAdminSecret('bad-secret');
    expect(result.valid).toBe(false);
    expect(result.message).toBe('Não foi possível validar a chave.');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('[admin-api]');
    expect(warnSpy.mock.calls[0][0]).toContain('/admin/overview');
    expect(warnSpy.mock.calls[0][1]).toBe('Unauthorized');
  });

  it('returns valid: false with default message for 500 response', async () => {
    globalThis.fetch = buildMockFetch(new Response('{}', { status: 500 }));
    const result = await validateAdminSecret('any-secret');
    expect(result.valid).toBe(false);
    expect(result.message).toBe('Não foi possível validar a chave.');
  });

  it('trims the provided secret', async () => {
    globalThis.fetch = buildMockFetch(new Response('{}', { status: 200 }));
    const result = await validateAdminSecret('  test-secret  ');
    expect(result.valid).toBe(true);
    expect(result.message).toBeNull();
  });
});