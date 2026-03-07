import { randomUUID } from 'node:crypto';
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

interface ApiMetrics {
  totalRequests: number;
  pipelineRequests: number;
  pipelineSuccess: number;
  pipelineErrors: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
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
  const metrics: ApiMetrics = {
    totalRequests: 0,
    pipelineRequests: 0,
    pipelineSuccess: 0,
    pipelineErrors: 0,
    totalLatencyMs: 0,
    avgLatencyMs: 0,
  };

  return createServer(async (req, res) => {
    const requestId = getHeaderValue(req.headers['x-request-id']) ?? randomUUID();
    const startedAt = Date.now();

    metrics.totalRequests += 1;
    res.setHeader('x-request-id', requestId);

    if (!req.url || !req.method) {
      logEvent('warn', requestId, 'invalid_request', { method: req.method, url: req.url });
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

    if (req.method === 'GET' && req.url === '/metrics') {
      json(res, 200, {
        ok: true,
        metrics,
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/pipeline/run') {
      metrics.pipelineRequests += 1;

      if (apiKey && req.headers['x-api-key'] !== apiKey) {
        metrics.pipelineErrors += 1;
        updateLatency(metrics, startedAt);
        logEvent('warn', requestId, 'unauthorized', { route: '/v1/pipeline/run' });
        json(res, 401, { ok: false, error: 'unauthorized' });
        return;
      }

      if (!isJsonContentType(req.headers['content-type'])) {
        metrics.pipelineErrors += 1;
        updateLatency(metrics, startedAt);
        logEvent('warn', requestId, 'invalid_content_type', { route: '/v1/pipeline/run' });
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
              metrics.pipelineErrors += 1;
              updateLatency(metrics, startedAt);
              logEvent('warn', requestId, 'idempotency_key_payload_mismatch', { idempotencyKey });
              json(res, 409, { ok: false, error: 'idempotency_key_payload_mismatch' });
              return;
            }

            metrics.pipelineSuccess += 1;
            updateLatency(metrics, startedAt);
            logEvent('info', requestId, 'idempotent_replay', { idempotencyKey });
            json(res, 200, {
              ...completed.response,
              idempotentReplay: true,
            });
            return;
          }

          const inFlight = inFlightByKey.get(idempotencyKey);
          if (inFlight) {
            if (inFlight.fingerprint !== fingerprint) {
              metrics.pipelineErrors += 1;
              updateLatency(metrics, startedAt);
              logEvent('warn', requestId, 'idempotency_key_payload_mismatch', { idempotencyKey });
              json(res, 409, { ok: false, error: 'idempotency_key_payload_mismatch' });
              return;
            }

            const replay = await inFlight.promise;
            metrics.pipelineSuccess += 1;
            updateLatency(metrics, startedAt);
            logEvent('info', requestId, 'inflight_replay', { idempotencyKey });
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

        metrics.pipelineSuccess += 1;
        updateLatency(metrics, startedAt);
        logEvent('info', requestId, 'pipeline_run_success', {
          route: '/v1/pipeline/run',
          stage: success.stage,
          nextAction: success.nextAction,
        });
        json(res, 200, success);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown_error';
        metrics.pipelineErrors += 1;
        updateLatency(metrics, startedAt);

        if (message === 'payload_too_large') {
          logEvent('warn', requestId, 'payload_too_large', { route: '/v1/pipeline/run' });
          json(res, 413, { ok: false, error: message });
          return;
        }

        logEvent('error', requestId, 'pipeline_run_failed', {
          route: '/v1/pipeline/run',
          error: message,
        });
        json(res, 400, { ok: false, error: message });
      }
      return;
    }

    logEvent('warn', requestId, 'route_not_found', { method: req.method, url: req.url });
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

function updateLatency(metrics: ApiMetrics, startedAt: number): void {
  const latency = Date.now() - startedAt;
  metrics.totalLatencyMs += latency;
  metrics.avgLatencyMs = metrics.pipelineRequests === 0 ? 0 : Math.round(metrics.totalLatencyMs / metrics.pipelineRequests);
}

function logEvent(level: 'info' | 'warn' | 'error', requestId: string, event: string, extra: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      requestId,
      event,
      ...extra,
    }),
  );
}
