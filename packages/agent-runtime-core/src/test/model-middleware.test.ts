import { describe, expect, it } from 'vitest';

import { applyStepModelMiddlewares, defineStepModelMiddleware } from '../integrations/adapters/model-middleware.js';
import { AgentRuntime } from '../core/runtime.js';
import { createRuntimeHost } from '../integrations/hosts/runtime-host.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('step model middleware', () => {
  it('applies middleware in declaration order', async () => {
    const middlewareLog: string[] = [];
    const model = applyStepModelMiddlewares(
      new FakeStepModelAdapter(() => ({
        segments: [{ kind: 'message', text: 'ok' }],
        actionRequests: [],
        continuation: 'stop',
      })),
      [
        defineStepModelMiddleware((next) => ({
          async generateStep(request) {
            middlewareLog.push(`first:${request.stepNumber}`);
            return next.generateStep(request);
          },
        })),
        defineStepModelMiddleware((next) => ({
          async generateStep(request) {
            middlewareLog.push(`second:${request.stepNumber}`);
            return next.generateStep(request);
          },
        })),
      ],
    );
    const runtime = new AgentRuntime({
      runtimeId: 'middleware-runtime',
      model,
    });

    await runtime.dispatch({
      id: 'input-1',
      type: 'message',
      payload: { text: 'hello' },
    });
    await runtime.run();

    expect(middlewareLog).toEqual(['first:1', 'second:1']);
  });

  it('can be wired through runtime host options', async () => {
    const middlewareLog: string[] = [];
    const host = createRuntimeHost({
      runtime: {
        runtimeId: 'middleware-host',
        model: new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'ok' }],
          actionRequests: [],
          continuation: 'stop',
        })),
      },
      modelMiddlewares: [
        defineStepModelMiddleware((next) => ({
          async generateStep(request) {
            middlewareLog.push(request.runtimeId);
            return next.generateStep(request);
          },
        })),
      ],
    });

    await host.runtime.dispatch({
      id: 'input-1',
      type: 'message',
      payload: { text: 'hello' },
    });
    await host.runtime.run();

    expect(middlewareLog).toEqual(['middleware-host']);
  });
});
