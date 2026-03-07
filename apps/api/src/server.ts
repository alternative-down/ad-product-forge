import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  runPipelineFromSource,
  type PipelineOrchestratorDeps,
  type SourcePayload,
  type SourceType,
} from '@ad-product-forge/core';

interface RunRequestBody {
  sourceType: SourceType;
  payload: SourcePayload;
  parentJobId?: string | null;
}

interface ExternalHookRequestBody {
  source: string;
  eventType: string;
  occurredAt?: string;
  externalId?: string;
  content: string;
  link?: string;
  context?: Record<string, unknown>;
}

interface RunSuccessResponse {
  ok: true;
  stage: string;
  nextAction: string;
  output: Record<string, unknown>;
  idempotentReplay?: boolean;
}

interface IdempotencyRecord {
  fingerprint: string;
  response: RunSuccessResponse;
  expiresAt: number;
}

interface InFlightRecord {
  fingerprint: string;
  promise: Promise<RunSuccessResponse>;
}

export interface ApiServerOptions {
  deps?: PipelineOrchestratorDeps;
  maxBodyBytes?: number;
  apiKey?: string;
  idempotencyTtlMs?: number;
}

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024; // 1MB
const DEFAULT_IDEMPOTENCY_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function createApiServer(options: ApiServerOptions = {}): Server {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const deps = options.deps ?? {};
  const apiKey = options.apiKey;
  const idempotencyTtlMs = options.idempotencyTtlMs ?? DEFAULT_IDEMPOTENCY_TTL_MS;

  const completedByKey = new Map<string, IdempotencyRecord>();
  const inFlightByKey = new Map<string, InFlightRecord>();

  return createServer(async (req, res) => {
    if (!req.url || !req.method) {
      json(res, 404, { error: 'not_found' });
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      json(res, 200, { ok: true, service: 'ad-product-forge-api' });
      return;
    }

    if (req.method === 'GET' && req.url === '/ready') {
      json(res, 200, { ok: true, ready: true });
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/hooks/external') {
      if (apiKey && req.headers['x-api-key'] !== apiKey) {
        json(res, 401, { ok: false, error: 'unauthorized' });
        return;
      }

      if (!isJsonContentType(req.headers['content-type'])) {
        json(res, 415, { ok: false, error: 'content_type_must_be_application_json' });
        return;
      }

      try {
        const body = (await readJson(req, maxBodyBytes)) as ExternalHookRequestBody;
        const normalized = normalizeExternalHook(body);

        const result = await runPipelineFromSource(
          {
            sourceType: 'webhook',
            payload: normalized,
          },
          {
            ...deps,
            parentJobId: null,
          },
        );

        json(res, 200, {
          ok: true,
          source: body.source,
          eventType: body.eventType,
          stage: result.stage,
          nextAction: result.nextAction,
          output: result.finalOutput,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown_error';
        if (message === 'payload_too_large') {
          json(res, 413, { ok: false, error: message });
          return;
        }

        json(res, 400, { ok: false, error: message });
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/pipeline/run') {
      if (apiKey && req.headers['x-api-key'] !== apiKey) {
        json(res, 401, { ok: false, error: 'unauthorized' });
        return;
      }

      if (!isJsonContentType(req.headers['content-type'])) {
        json(res, 415, { ok: false, error: 'content_type_must_be_application_json' });
        return;
      }

      try {
        pruneExpired(completedByKey);

        const body = (await readJson(req, maxBodyBytes)) as RunRequestBody;
        const idempotencyKey = getHeaderValue(req.headers['x-idempotency-key']);
        const fingerprint = JSON.stringify(body);

        if (idempotencyKey) {
          const completed = completedByKey.get(idempotencyKey);
          if (completed) {
            if (completed.fingerprint !== fingerprint) {
              json(res, 409, { ok: false, error: 'idempotency_key_payload_mismatch' });
              return;
            }

            json(res, 200, {
              ...completed.response,
              idempotentReplay: true,
            });
            return;
          }

          const inFlight = inFlightByKey.get(idempotencyKey);
          if (inFlight) {
            if (inFlight.fingerprint !== fingerprint) {
              json(res, 409, { ok: false, error: 'idempotency_key_payload_mismatch' });
              return;
            }

            const replay = await inFlight.promise;
            json(res, 200, {
              ...replay,
              idempotentReplay: true,
            });
            return;
          }
        }

        const runPromise = runPipelineFromSource(
          {
            sourceType: body.sourceType,
            payload: body.payload,
          },
          {
            ...deps,
            parentJobId: body.parentJobId ?? null,
          },
        ).then((result): RunSuccessResponse => ({
          ok: true,
          stage: result.stage,
          nextAction: result.nextAction,
          output: result.finalOutput as unknown as Record<string, unknown>,
        }));

        if (idempotencyKey) {
          inFlightByKey.set(idempotencyKey, {
            fingerprint,
            promise: runPromise,
          });
        }

        const success = await runPromise;

        if (idempotencyKey) {
          inFlightByKey.delete(idempotencyKey);
          completedByKey.set(idempotencyKey, {
            fingerprint,
            response: success,
            expiresAt: Date.now() + idempotencyTtlMs,
          });
        }

        json(res, 200, success);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown_error';
        if (message === 'payload_too_large') {
          json(res, 413, { ok: false, error: message });
          return;
        }

        json(res, 400, { ok: false, error: message });
      }
      return;
    }

    json(res, 404, { error: 'not_found' });
  });
}

export async function startApiServer(port = Number(process.env.PORT ?? 3000)): Promise<Server> {
  const artifactBaseDir = process.env.ARTIFACTS_DIR;
  const apiKey = process.env.PIPELINE_API_KEY;

  const server = createApiServer({
    deps: {
      artifactBaseDir,
    },
    apiKey,
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  return server;
}

async function readJson(req: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += part.length;

    if (total > maxBodyBytes) {
      throw new Error('payload_too_large');
    }

    chunks.push(part);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    throw new Error('empty_body');
  }

  return JSON.parse(raw);
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function isJsonContentType(header: string | string[] | undefined): boolean {
  if (!header) {
    return false;
  }

  const value = Array.isArray(header) ? header.join(';') : header;
  return value.toLowerCase().includes('application/json');
}

function getHeaderValue(header: string | string[] | undefined): string | undefined {
  if (!header) {
    return undefined;
  }

  return Array.isArray(header) ? header[0] : header;
}

function pruneExpired(store: Map<string, IdempotencyRecord>): void {
  const now = Date.now();
  for (const [key, record] of store.entries()) {
    if (record.expiresAt <= now) {
      store.delete(key);
    }
  }
}

function normalizeExternalHook(body: ExternalHookRequestBody): SourcePayload {
  if (!body.source || !body.eventType || !body.content) {
    throw new Error('source,eventType,content are required');
  }

  const occurredAt = body.occurredAt ?? new Date().toISOString();
  const externalId = body.externalId ?? `${body.source}:${body.eventType}:${occurredAt}`;

  return {
    id: externalId,
    occurred_at: occurredAt,
    body: body.content,
    url: body.link,
    meta: {
      source: body.source,
      event_type: body.eventType,
      ...(body.context ?? {}),
    },
  };
}
