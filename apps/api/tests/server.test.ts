import { afterEach, describe, expect, it } from 'vitest';
import { createApiServer } from '../src/server.js';

const servers: Array<{ close: () => void }> = [];

afterEach(() => {
  while (servers.length > 0) {
    const entry = servers.pop();
    entry?.close();
  }
});

describe('api server', () => {
  it('responds health check', async () => {
    const { url } = await start();

    const response = await fetch(`${url}/health`);
    const body = (await response.json()) as { ok: boolean };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('responds ready check', async () => {
    const { url } = await start();

    const response = await fetch(`${url}/ready`);
    const body = (await response.json()) as { ok: boolean; ready: boolean };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.ready).toBe(true);
  });

  it('runs pipeline from source payload', async () => {
    const { url } = await start();

    const response = await fetch(`${url}/v1/pipeline/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sourceType: 'manual',
        payload: {
          item_id: 'api-1',
          timestamp: '2026-03-07T00:00:00.000Z',
          note: 'Falha em onboarding de cliente recorrente',
          author: 'nicolas',
          context: { team: 'ops' },
        },
      }),
    });

    const body = (await response.json()) as {
      ok: boolean;
      stage: string;
      nextAction: string;
      output: { status: string; score: number | null };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.stage).toBe('score');
    expect(body.nextAction).toBe('forward');
    expect(body.output.status).toBe('ok');
    expect(typeof body.output.score).toBe('number');
  });

  it('requires api key when configured', async () => {
    const { url } = await start({ apiKey: 'secret-key' });

    const unauthorized = await fetch(`${url}/v1/pipeline/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sourceType: 'manual',
        payload: {
          item_id: 'api-1',
          timestamp: '2026-03-07T00:00:00.000Z',
          note: 'test',
        },
      }),
    });

    expect(unauthorized.status).toBe(401);

    const authorized = await fetch(`${url}/v1/pipeline/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'secret-key',
      },
      body: JSON.stringify({
        sourceType: 'manual',
        payload: {
          item_id: 'api-2',
          timestamp: '2026-03-07T00:00:00.000Z',
          note: 'authorized test',
        },
      }),
    });

    expect(authorized.status).toBe(200);
  });

  it('replays same idempotency key for same payload', async () => {
    const { url } = await start();

    const payload = {
      sourceType: 'manual',
      payload: {
        item_id: 'idem-1',
        timestamp: '2026-03-07T00:00:00.000Z',
        note: 'idempotent test',
      },
    };

    const first = await fetch(`${url}/v1/pipeline/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-idempotency-key': 'key-1',
      },
      body: JSON.stringify(payload),
    });

    const second = await fetch(`${url}/v1/pipeline/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-idempotency-key': 'key-1',
      },
      body: JSON.stringify(payload),
    });

    const firstBody = (await first.json()) as { output: { job_id: string } };
    const secondBody = (await second.json()) as { output: { job_id: string }; idempotentReplay?: boolean };

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(secondBody.idempotentReplay).toBe(true);
    expect(secondBody.output.job_id).toBe(firstBody.output.job_id);
  });

  it('returns 409 when same idempotency key is reused with different payload', async () => {
    const { url } = await start();

    const first = await fetch(`${url}/v1/pipeline/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-idempotency-key': 'key-2',
      },
      body: JSON.stringify({
        sourceType: 'manual',
        payload: {
          item_id: 'idem-a',
          timestamp: '2026-03-07T00:00:00.000Z',
          note: 'a',
        },
      }),
    });

    const second = await fetch(`${url}/v1/pipeline/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-idempotency-key': 'key-2',
      },
      body: JSON.stringify({
        sourceType: 'manual',
        payload: {
          item_id: 'idem-b',
          timestamp: '2026-03-07T00:00:00.000Z',
          note: 'b',
        },
      }),
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
  });

  it('ingests external hook and forwards to pipeline', async () => {
    const { url } = await start();

    const response = await fetch(`${url}/v1/hooks/external`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'billing',
        eventType: 'invoice.payment_failed',
        occurredAt: '2026-03-07T00:00:00.000Z',
        externalId: 'evt-1',
        content: 'Customer payment failed for plan Pro',
        link: 'https://billing.example/events/evt-1',
        context: { provider: 'stripe' },
      }),
    });

    const body = (await response.json()) as {
      ok: boolean;
      source: string;
      eventType: string;
      output: { status: string; item_id: string };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.source).toBe('billing');
    expect(body.eventType).toBe('invoice.payment_failed');
    expect(body.output.status).toBe('ok');
    expect(body.output.item_id).toBe('evt-1');
  });

  it('requires api key on external hook endpoint when configured', async () => {
    const { url } = await start({ apiKey: 'secret-key' });

    const unauthorized = await fetch(`${url}/v1/hooks/external`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'billing',
        eventType: 'invoice.payment_failed',
        content: 'x',
      }),
    });

    expect(unauthorized.status).toBe(401);
  });

  it('returns 415 on non-json content type', async () => {
    const { url } = await start();

    const response = await fetch(`${url}/v1/pipeline/run`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'plain text',
    });

    expect(response.status).toBe(415);
  });

  it('returns 400 on invalid payload', async () => {
    const { url } = await start();

    const response = await fetch(`${url}/v1/pipeline/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sourceType: 'manual',
        payload: {
          item_id: '',
          timestamp: 'invalid',
          note: '',
        },
      }),
    });

    expect(response.status).toBe(400);
  });

  it('returns 413 when payload is too large', async () => {
    const { url } = await start({ maxBodyBytes: 50 });

    const response = await fetch(`${url}/v1/pipeline/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sourceType: 'manual',
        payload: {
          item_id: 'api-1',
          timestamp: '2026-03-07T00:00:00.000Z',
          note: 'x'.repeat(500),
        },
      }),
    });

    expect(response.status).toBe(413);
  });
});

async function start(opts: { maxBodyBytes?: number; apiKey?: string } = {}): Promise<{ url: string }> {
  const server = createApiServer({
    maxBodyBytes: opts.maxBodyBytes,
    apiKey: opts.apiKey,
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));

  servers.push({ close: () => server.close() });

  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('invalid_server_address');
  }

  return { url: `http://127.0.0.1:${addr.port}` };
}
