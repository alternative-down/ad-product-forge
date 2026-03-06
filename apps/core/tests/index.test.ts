import { describe, expect, it, vi } from 'vitest';
import { ValidationError, ingest, validateInput } from '../src/index';

describe('validateInput', () => {
  it('accepts a valid contract v1 payload', () => {
    expect(() =>
      validateInput({
        item_id: 'item-1',
        timestamp: '2026-03-06T16:00:00.000Z',
        content: 'raw user signal',
        context: { source: 'community' },
        link: 'https://example.com/post/1',
        source_type: 'coleta',
      }),
    ).not.toThrow();
  });

  it('rejects invalid source_type', () => {
    expect(() =>
      validateInput({
        item_id: 'item-1',
        timestamp: '2026-03-06T16:00:00.000Z',
        content: 'raw user signal',
        context: { source: 'community' },
        source_type: 'crawler' as never,
      }),
    ).toThrow(ValidationError);
  });

  it('rejects invalid link', () => {
    expect(() =>
      validateInput({
        item_id: 'item-1',
        timestamp: '2026-03-06T16:00:00.000Z',
        content: 'raw user signal',
        context: { source: 'community' },
        link: 'not-a-link',
        source_type: 'manual',
      }),
    ).toThrow(ValidationError);
  });
});

describe('ingest', () => {
  it('creates job_id, persists payload and returns output v1', async () => {
    const persistRawPayload = vi.fn(async () => Promise.resolve());

    const output = await ingest(
      {
        item_id: 'item-42',
        timestamp: '2026-03-06T16:00:00.000Z',
        content: 'detected pain point from forum',
        context: { tags: ['pain', 'billing'] },
        source_type: 'webhook',
      },
      {
        generateJobId: () => 'job-123',
        now: () => new Date('2026-03-06T17:00:00.000Z'),
        persistRawPayload,
      },
      'job-parent',
    );

    expect(persistRawPayload).toHaveBeenCalledWith({
      item_id: 'item-42',
      job_id: 'job-123',
      parent_job_id: 'job-parent',
      received_at: '2026-03-06T17:00:00.000Z',
      payload: {
        item_id: 'item-42',
        timestamp: '2026-03-06T16:00:00.000Z',
        content: 'detected pain point from forum',
        context: { tags: ['pain', 'billing'] },
        source_type: 'webhook',
      },
    });

    expect(output).toEqual({
      item_id: 'item-42',
      job_id: 'job-123',
      parent_job_id: 'job-parent',
      status: 'ok',
      score: null,
      artifacts: [],
      processed_at: '2026-03-06T17:00:00.000Z',
    });
  });
});
