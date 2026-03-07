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

export interface ApiServerOptions {
  deps?: PipelineOrchestratorDeps;
  maxBodyBytes?: number;
  apiKey?: string;
}

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024; // 1MB

export function createApiServer(options: ApiServerOptions = {}): Server {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const deps = options.deps ?? {};
  const apiKey = options.apiKey;

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
        const body = (await readJson(req, maxBodyBytes)) as RunRequestBody;

        const result = await runPipelineFromSource(
          {
            sourceType: body.sourceType,
            payload: body.payload,
          },
          {
            ...deps,
            parentJobId: body.parentJobId ?? null,
          },
        );

        json(res, 200, {
          ok: true,
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

function json(res: ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
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
