import { describe, expect, it } from 'vitest';
import { normalizeToPipelineInput } from './normalizer';

describe('ingress normalizer', () => {
  it('normalizes coleta payload to pipeline input', () => {
    const normalized = normalizeToPipelineInput('coleta', {
      item_id: 'coleta-1',
      timestamp: '2026-03-07T00:00:00.000Z',
      content: 'Sinal coletado da comunidade',
      context: { channel: 'discord' },
      link: 'https://example.com/coleta/1',
    });

    expect(normalized).toEqual({
      item_id: 'coleta-1',
      timestamp: '2026-03-07T00:00:00.000Z',
      content: 'Sinal coletado da comunidade',
      context: { channel: 'discord' },
      link: 'https://example.com/coleta/1',
      source_type: 'coleta',
    });
  });

  it('normalizes manual payload to pipeline input', () => {
    const normalized = normalizeToPipelineInput('manual', {
      item_id: 'manual-1',
      timestamp: '2026-03-07T00:00:00.000Z',
      note: 'Nota manual sobre fricção no onboarding',
      author: 'nicolas',
      context: { team: 'ops' },
    });

    expect(normalized).toEqual({
      item_id: 'manual-1',
      timestamp: '2026-03-07T00:00:00.000Z',
      content: 'Nota manual sobre fricção no onboarding',
      context: { team: 'ops', author: 'nicolas' },
      source_type: 'manual',
    });
  });

  it('normalizes webhook payload to pipeline input', () => {
    const normalized = normalizeToPipelineInput('webhook', {
      id: 'wh-1',
      occurred_at: '2026-03-07T00:00:00.000Z',
      body: 'Erro em integração externa',
      meta: { provider: 'stripe' },
      url: 'https://example.com/hooks/1',
    });

    expect(normalized).toEqual({
      item_id: 'wh-1',
      timestamp: '2026-03-07T00:00:00.000Z',
      content: 'Erro em integração externa',
      context: { provider: 'stripe' },
      link: 'https://example.com/hooks/1',
      source_type: 'webhook',
    });
  });

  it('throws validation error on invalid normalized payload', () => {
    expect(() =>
      normalizeToPipelineInput('manual', {
        item_id: '',
        timestamp: 'invalid-date',
        note: '',
      }),
    ).toThrow();
  });
});
