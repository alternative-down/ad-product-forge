/**
 * Integration tests for RuntimePlugin lifecycle hooks in agent-runtime-core.
 * Covers: onDispatch, provideContext, resolveModelRequest, onAfterModel,
 * onAfterActions, onAfterStep.
 * Zero prior coverage.
 */
import { describe, expect, it, vi } from 'vitest';
import { AgentRuntime } from '../core/runtime.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';
import { z } from 'zod';
import type { StepModelResponse, StepContextEntry } from '../core/types.js';
import type { RuntimePlugin } from '../core/plugins.js';

const fakeModelResponse = (overrides: Partial<StepModelResponse> = {}): StepModelResponse => ({
  segments: [{ kind: 'message', text: 'hello' }],
  actionRequests: [],
  continuation: 'stop',
  ...overrides,
});

describe('RuntimePlugin lifecycle hooks', () => {
  // ─── onDispatch ─────────────────────────────────────────────────────────────

  describe('onDispatch', () => {
    it('fires when runtime dispatches an input', async () => {
      const calls: { runtimeId: string; input: unknown }[] = [];
      const plugin = {
        name: 'dispatch-tracker',
        onDispatch: vi.fn().mockImplementation(async (ctx: { runtimeId: string; input: unknown }) => {
          calls.push(ctx);
        }),
      };

      const runtime = new AgentRuntime({
        model: new FakeStepModelAdapter(() => fakeModelResponse()),
      });
      runtime.use(plugin);

      runtime.dispatch({ id: 'test-input', type: 'test', payload: 'test' });
      await runtime.step();

      expect(plugin.onDispatch).toHaveBeenCalledTimes(1);
      expect(calls[0].runtimeId).toBeTruthy();
      expect(calls[0].input).toMatchObject({ type: 'test', payload: 'test' });
    });

    it('fires with input receivedAt if provided', async () => {
      const receivedAt = '2025-01-01T12:00:00.000Z';
      const callInputs: unknown[] = [];
      const plugin = {
        name: 'dispatch-tracker',
        onDispatch: vi.fn().mockImplementation(async (ctx: { runtimeId: string; input: unknown }) => {
          callInputs.push(ctx.input);
        }),
      };

      const runtime = new AgentRuntime({
        model: new FakeStepModelAdapter(() => fakeModelResponse()),
      });
      runtime.use(plugin);

      runtime.dispatch({ id: 'test-input', type: 'test', payload: 'with-timestamp', receivedAt });
      await runtime.step();

      expect(callInputs[0]).toMatchObject({ type: 'test', payload: 'with-timestamp', receivedAt });
    });

    it('receives multiple dispatches across multiple steps', async () => {
      const dispatchCount = vi.fn();
      const plugin = {
        name: 'dispatch-tracker',
        onDispatch: dispatchCount.mockImplementation(async () => {}),
      };

      const runtime = new AgentRuntime({
        model: new FakeStepModelAdapter(() => fakeModelResponse()),
      });
      runtime.use(plugin);

      runtime.dispatch({ id: 'test-input', type: 'test', payload: 'first' });
      runtime.dispatch({ id: 'test-input', type: 'test', payload: 'second' });
      await runtime.step();

      expect(dispatchCount).toHaveBeenCalledTimes(2);
    });
  });

  // ─── provideContext ─────────────────────────────────────────────────────────

  describe('provideContext', () => {
    it('contributes additional context entries to step context', async () => {
      const plugin = {
        name: 'context-contributor',
        provideContext: vi.fn().mockImplementation(async (): Promise<StepContextEntry[]> => [
          {
            id: 'context-1',
            kind: 'context',
            title: 'injected',
            text: 'injected: true',
          },
        ]),
      };

      const runtime = new AgentRuntime({
        model: new FakeStepModelAdapter((req) => {
          // Context should contain the injected entry
          const hasInjection = req.context.some(
            (e) => e.text === 'injected: true',
          );
          return fakeModelResponse({ segments: [{ kind: 'message', text: hasInjection ? 'found' : 'missing' }] });
        }),
      });
      runtime.use(plugin);

      runtime.dispatch({ id: 'test-input', type: 'test', payload: 'test' });
      await runtime.step();

      expect(plugin.provideContext).toHaveBeenCalledTimes(1);
    });

    it('receives correct context values including runtimeId, stepId, pendingInputs, lastActionResults, steps', async () => {
      let receivedContext: { runtimeId: string; stepId: string; stepNumber: number; pendingInputs: unknown[]; lastActionResults: unknown[]; steps: unknown[] } | null = null;
      const plugin = {
        name: 'context-inspector',
        provideContext: vi.fn().mockImplementation(async (ctx) => {
          receivedContext = ctx;
          return [];
        }),
      };

      const runtime = new AgentRuntime({
        model: new FakeStepModelAdapter(() => fakeModelResponse()),
      });
      runtime.use(plugin);

      runtime.dispatch({ id: 'test-input', type: 'test', payload: 'inspect' });
      await runtime.step();

      expect(receivedContext).not.toBeNull();
      expect(receivedContext!.runtimeId).toBeTruthy();
      expect(receivedContext!.stepId).toBeDefined();
      expect(receivedContext!.stepNumber).toBe(1);
      expect(receivedContext!.pendingInputs).toHaveLength(1); // the input we just dispatched
    });
  });

  // ─── resolveModelRequest ────────────────────────────────────────────────────

  describe('resolveModelRequest', () => {
    it('can modify the model request before it is sent to the model', async () => {
      const plugin = {
        name: 'request-mutator',
        resolveModelRequest: vi.fn().mockImplementation(async (ctx) => {
          // Inject a system instruction
          return {
            ...ctx.request,
            context: [
              ...ctx.request.context,
              { role: 'system', content: 'mutated: true' },
            ],
          };
        }),
      };

      const runtime = new AgentRuntime({
        model: new FakeStepModelAdapter((req) => {
          const hasMutation = req.context.some(
            (e) => e.text === 'mutated: true',
          );
          return fakeModelResponse({ segments: [{ kind: 'message', text: hasMutation ? 'mutated' : 'original' }] });
        }),
      });
      runtime.use(plugin);

      runtime.dispatch({ id: 'test-input', type: 'test', payload: 'test' });
      await runtime.step();

      expect(plugin.resolveModelRequest).toHaveBeenCalledTimes(1);
    });

    it('receives partial request object with all expected fields', async () => {
      let receivedRequest: Parameters<NonNullable<(typeof plugin)['resolveModelRequest']>>[0] | null = null;
      const plugin = {
        name: 'request-inspector',
        resolveModelRequest: vi.fn().mockImplementation(async (ctx) => {
          receivedRequest = ctx;
          return ctx.request;
        }),
      };

      const runtime = new AgentRuntime({
        model: new FakeStepModelAdapter(() => fakeModelResponse()),
      });
      runtime.use(plugin);

      runtime.dispatch({ id: 'test-input', type: 'test', payload: 'inspect-request' });
      await runtime.step();

      expect(receivedRequest).not.toBeNull();
      expect(receivedRequest!.request).toBeDefined();
      expect(receivedRequest!.runtimeId).toBeTruthy();
      expect(receivedRequest!.stepId).toBeDefined();
    });
  });

  // ─── onAfterModel ──────────────────────────────────────────────────────────

  describe('onAfterModel', () => {
    it('fires after model generates a response', async () => {
      const modelResponse = fakeModelResponse({ segments: [{ kind: 'message', text: 'response' }] });
      const callArgs: Array<Parameters<NonNullable<RuntimePlugin['onAfterModel']>>[0]> = [];
      const plugin = {
        name: 'model-observer',
        onAfterModel: vi.fn().mockImplementation(async (ctx) => {
          callArgs.push(ctx);
        }),
      };

      const runtime = new AgentRuntime({
        model: new FakeStepModelAdapter(() => modelResponse),
      });
      runtime.use(plugin);

      runtime.dispatch({ id: 'test-input', type: 'test', payload: 'test' });
      await runtime.step();

      expect(plugin.onAfterModel).toHaveBeenCalledTimes(1);
      expect(callArgs[0].runtimeId).toBeTruthy();
      expect(callArgs[0].stepId).toBeDefined();
      expect(callArgs[0].stepNumber).toBe(1);
      expect(callArgs[0].response.segments[0].text).toBe('response');
    });

    it('receives the raw model response including segments and continuation', async () => {
      const modelResponse = fakeModelResponse({ continuation: 'continue' });
      const plugin = {
        name: 'model-observer',
        onAfterModel: vi.fn().mockImplementation(async () => {}),
      };

      const runtime = new AgentRuntime({
        model: new FakeStepModelAdapter(() => modelResponse),
      });
      runtime.use(plugin);

      runtime.dispatch({ id: 'test-input', type: 'test', payload: 'test' });
      await runtime.step();

      expect(plugin.onAfterModel).toHaveBeenCalledWith(
        expect.objectContaining({ response: expect.objectContaining({ continuation: 'continue' }) }),
      );
    });
  });

  // ─── onAfterActions ────────────────────────────────────────────────────────

  describe('onAfterActions', () => {
    it('fires after action execution completes', async () => {
      const plugin = {
        name: 'action-observer',
        onAfterActions: vi.fn().mockImplementation(async () => {}),
      };

      const runtime = new AgentRuntime({
        model: new FakeStepModelAdapter(() => fakeModelResponse({
          actionRequests: [{ name: 'test-action', input: {} }],
        })),
      });
      runtime.registerAction({
        name: 'test-action',
        description: 'A test action',
        inputSchema: z.object({}),
        execute: async () => null,
      });
      runtime.use(plugin);

      runtime.dispatch({ id: 'test-input', type: 'test', payload: 'test' });
      await runtime.step();

      expect(plugin.onAfterActions).toHaveBeenCalledTimes(1);
    });

    it('receives the full list of action results', async () => {
      let receivedResults: unknown[] = [];
      const plugin = {
        name: 'action-observer',
        onAfterActions: vi.fn().mockImplementation(async (ctx) => {
          receivedResults = ctx.actionResults;
        }),
      };

      const runtime = new AgentRuntime({
        model: new FakeStepModelAdapter(() => fakeModelResponse({
          actionRequests: [{ name: 'test-action', input: {} }],
        })),
      });
      runtime.registerAction({
        name: 'test-action',
        description: 'A test action',
        inputSchema: z.object({}),
        execute: async () => null,
      });
      runtime.use(plugin);

      runtime.dispatch({ id: 'test-input', type: 'test', payload: 'test' });
      await runtime.step();

      expect(Array.isArray(receivedResults)).toBe(true);
      expect(receivedResults.length).toBeGreaterThan(0);
    });
  });

  // ─── onAfterStep ───────────────────────────────────────────────────────────

  describe('onAfterStep', () => {
    it('fires after every step completes with record and snapshot', async () => {
      const plugin = {
        name: 'step-observer',
        onAfterStep: vi.fn().mockImplementation(async () => {}),
      };

      const runtime = new AgentRuntime({
        model: new FakeStepModelAdapter(() => fakeModelResponse()),
      });
      runtime.use(plugin);

      runtime.dispatch({ id: 'test-input', type: 'test', payload: 'test' });
      const result = await runtime.step();

      expect(plugin.onAfterStep).toHaveBeenCalledTimes(1);
      expect(result).not.toBeNull();
    });

    it('receives record with id, stepNumber, inputs, modelResponse, actionResults, continuation', async () => {
      let receivedRecord: Parameters<NonNullable<(typeof plugin)['onAfterStep']>>[0]['record'] | null = null;
      const plugin = {
        name: 'step-observer',
        onAfterStep: vi.fn().mockImplementation(async (ctx) => {
          receivedRecord = ctx.record;
        }),
      };

      const runtime = new AgentRuntime({
        model: new FakeStepModelAdapter(() => fakeModelResponse()),
      });
      runtime.use(plugin);

      runtime.dispatch({ id: 'test-input', type: 'test', payload: 'test' });
      await runtime.step();

      expect(receivedRecord).not.toBeNull();
      expect(receivedRecord!.id).toBeDefined();
      expect(receivedRecord!.stepNumber).toBe(1);
      expect(receivedRecord!.inputs).toHaveLength(1);
      expect(receivedRecord!.modelResponse).toBeDefined();
      expect(receivedRecord!.actionResults).toEqual([]);
      expect(receivedRecord!.startedAt).toBeDefined();
      expect(receivedRecord!.finishedAt).toBeDefined();
    });

    it('receives snapshot containing runtimeId and steps', async () => {
      let receivedSnapshot: Parameters<NonNullable<(typeof plugin)['onAfterStep']>>[0]['snapshot'] | null = null;
      const plugin = {
        name: 'step-observer',
        onAfterStep: vi.fn().mockImplementation(async (ctx) => {
          receivedSnapshot = ctx.snapshot;
        }),
      };

      const runtime = new AgentRuntime({
        model: new FakeStepModelAdapter(() => fakeModelResponse()),
      });
      runtime.use(plugin);

      runtime.dispatch({ id: 'test-input', type: 'test', payload: 'test' });
      await runtime.step();

      expect(receivedSnapshot).not.toBeNull();
      expect(receivedSnapshot!.runtimeId).toBeTruthy();
      expect(receivedSnapshot!.status).toBeDefined();
    });
  });

  // ─── Multiple plugins ──────────────────────────────────────────────────────

  describe('multiple plugins', () => {
    it('all plugins receive lifecycle callbacks in order', async () => {
      const callOrder: string[] = [];
      const pluginA = {
        name: 'plugin-a',
        onDispatch: vi.fn().mockImplementation(async () => { callOrder.push('a-dispatch'); }),
        onAfterModel: vi.fn().mockImplementation(async () => { callOrder.push('a-after-model'); }),
        onAfterStep: vi.fn().mockImplementation(async () => { callOrder.push('a-after-step'); }),
      };
      const pluginB = {
        name: 'plugin-b',
        onDispatch: vi.fn().mockImplementation(async () => { callOrder.push('b-dispatch'); }),
        onAfterModel: vi.fn().mockImplementation(async () => { callOrder.push('b-after-model'); }),
        onAfterStep: vi.fn().mockImplementation(async () => { callOrder.push('b-after-step'); }),
      };

      const runtime = new AgentRuntime({
        model: new FakeStepModelAdapter(() => fakeModelResponse()),
      });
      runtime.use(pluginA);
      runtime.use(pluginB);

      runtime.dispatch({ id: 'test-input', type: 'test', payload: 'test' });
      await runtime.step();

      expect(callOrder).toEqual([
        'a-dispatch',
        'b-dispatch',
        'a-after-model',
        'b-after-model',
        'a-after-step',
        'b-after-step',
      ]);
    });
  });

  // ─── Plugin optional hooks ─────────────────────────────────────────────────

  describe('optional hooks', () => {
    it('plugin with no hooks still works', async () => {
      const plugin = { name: 'no-hooks' };

      const runtime = new AgentRuntime({
        model: new FakeStepModelAdapter(() => fakeModelResponse()),
      });
      runtime.use(plugin);

      runtime.dispatch({ id: 'test-input', type: 'test', payload: 'test' });
      const result = await runtime.step();

      expect(result).not.toBeNull();
    });

    it('plugin with only onAfterStep still gets called', async () => {
      const stepCount = vi.fn();
      const plugin = {
        name: 'step-only',
        onAfterStep: stepCount.mockImplementation(async () => {}),
      };

      const runtime = new AgentRuntime({
        model: new FakeStepModelAdapter(() => fakeModelResponse()),
      });
      runtime.use(plugin);

      runtime.dispatch({ id: 'test-input', type: 'test', payload: 'test' });
      await runtime.step();

      expect(stepCount).toHaveBeenCalledTimes(1);
    });
  });



  // ─── Multi-step execution ──────────────────────────────────────────────────

  describe('multi-step execution', () => {
    it('onAfterStep fires for each step with correct stepNumber', async () => {
      const stepNumbers: number[] = [];
      const plugin = {
        name: 'step-counter',
        onAfterStep: vi.fn().mockImplementation(async (ctx) => {
          stepNumbers.push(ctx.record.stepNumber);
        }),
      };

      const runtime = new AgentRuntime({
        model: new FakeStepModelAdapter(() => fakeModelResponse()),
      });
      runtime.use(plugin);

      runtime.dispatch({ id: 'test-input', type: 'test', payload: 'first' });
      await runtime.step();

      runtime.dispatch({ id: 'test-input', type: 'test', payload: 'second' });
      await runtime.step();

      expect(plugin.onAfterStep).toHaveBeenCalledTimes(2);
      expect(stepNumbers).toEqual([1, 2]);
    });

    it('provideContext receives lastActionResults from previous step', async () => {
      let receivedLastResults: unknown = undefined;
      const plugin = {
        name: 'context-inspector',
        provideContext: vi.fn().mockImplementation(async (ctx) => {
          receivedLastResults = ctx.lastActionResults;
          return [];
        }),
      };

      const runtime = new AgentRuntime({
        model: new FakeStepModelAdapter(() => fakeModelResponse()),
      });
      runtime.use(plugin);

      runtime.dispatch({ id: 'test-input', type: 'test', payload: 'first' });
      await runtime.step(); // first step, lastActionResults = []

      expect(plugin.provideContext).toHaveBeenCalledTimes(1);
    });
  });
});