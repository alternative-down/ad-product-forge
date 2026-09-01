import { describe, expect, it, vi } from 'vitest';
import { RuntimeActionRegistry } from '../actions.js';
import { z } from 'zod';

describe('RuntimeActionRegistry', () => {
  describe('register and describe', () => {
    it('describes registered actions', () => {
      const registry = new RuntimeActionRegistry();
      registry.register({
        name: 'test-action',
        description: 'A test action',
        inputSchema: z.object({ value: z.string() }),
        execute: async () => null,
      });

      const descriptors = registry.describe();
      expect(descriptors).toHaveLength(1);
      expect(descriptors[0].name).toBe('test-action');
    });

    it('describes multiple actions', () => {
      const registry = new RuntimeActionRegistry();
      registry.register({
        name: 'action-a',
        description: 'First',
        inputSchema: z.object({}),
        execute: async () => null,
      });
      registry.register({
        name: 'action-b',
        description: 'Second',
        inputSchema: z.object({}),
        execute: async () => null,
      });

      const descriptors = registry.describe();
      expect(descriptors).toHaveLength(2);
    });
  });

  describe('execute', () => {
    it('executes a registered action', async () => {
      const registry = new RuntimeActionRegistry();
      const execute = vi.fn().mockResolvedValue({ result: 'ok' });
      registry.register({
        name: 'greet',
        description: 'Greet',
        inputSchema: z.object({ name: z.string() }),
        execute: async (input) => ({ greeting: 'Hello, ' + input.name }),
      });

      const result = await registry.execute(
        'greet',
        { name: 'Alice' },
        {
          runtimeId: 'r1',
          stepId: 's1',
          stepNumber: 1,
        },
      );

      expect(result.name).toBe('greet');
      expect((result.output as { greeting: string }).greeting).toBe('Hello, Alice');
    });

    it('throws when executing unknown action', async () => {
      const registry = new RuntimeActionRegistry();

      await expect(
        registry.execute(
          'unknown-action',
          {},
          {
            runtimeId: 'r1',
            stepId: 's1',
            stepNumber: 1,
          },
        ),
      ).rejects.toThrow('Unknown action: unknown-action');
    });

    it('rejects invalid input via schema', async () => {
      const registry = new RuntimeActionRegistry();
      registry.register({
        name: 'strict-action',
        description: 'Strict',
        inputSchema: z.object({ name: z.string().min(1) }),
        execute: async () => null,
      });

      await expect(
        registry.execute(
          'strict-action',
          { name: '' },
          {
            runtimeId: 'r1',
            stepId: 's1',
            stepNumber: 1,
          },
        ),
      ).rejects.toThrow();
    });

    it('uses custom parseInput when provided', async () => {
      const registry = new RuntimeActionRegistry();
      registry.register({
        name: 'custom-parse',
        description: 'Custom parse',
        inputSchema: z.object({}),
        parseInput: (input: Record<string, unknown>) =>
          ({
            parsed: String(input['raw']),
          }) as Record<string, unknown>,
        execute: async (input) => input,
      });

      const result = await registry.execute(
        'custom-parse',
        { raw: 42 },
        {
          runtimeId: 'r1',
          stepId: 's1',
          stepNumber: 1,
        },
      );

      expect(result.output).toEqual({ parsed: '42' });
    });
  });
});
