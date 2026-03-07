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

export function createApiServer(baseDeps: PipelineOrchestratorDeps = {}): Server {
  return createServer(async (req, res) => {
    if (!req.url || !req.method) {
      json(res, 404, { error: 'not_found' });
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      json(res, 200, { ok: true, service: 'ad-product-forge-api' });
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/pipeline/run') {
      try {
        const body = (await readJson(req)) as RunRequestBody;

        const result = await runPipelineFromSource(
          {
            sourceType: body.sourceType,
            payload: body.payload,
          },
          {
            ...baseDeps,
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
        json(res, 400, { ok: false, error: message });
      }
      return;
    }

    json(res, 404, { error: 'not_found' });
  });
}

export async function startApiServer(port = Number(process.env.PORT ?? 3000)): Promise<Server> {
  const server = createApiServer();
  await new Promise<void>((resolve) => server.listen(port, resolve));
  return server;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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
