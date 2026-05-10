import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { RuntimeActionRegistry } from '../core/actions.js';

describe('RuntimeActionRegistry', () => {
  describe('register', () => {
    it('registers a new action and makes it available via describe()', () => {
      const registry = new RuntimeActionRegistry();

      registry.register({
        name: 'get-time',
        description: 'Returns the current Unix timestamp',
        inputSchema: z.object({}),
        async execute() {
          return { timestamp: 1704067200 };
        },
      });

      const actions = registry.describe();
      expect(actions).toHaveLength(1);
      expect(actions[0].name).toBe('get-time');
      expect(actions[0].description).toBe('Returns the current Unix timestamp');
    });

    it('allows multiple actions to be registered', () => {
      const registry = new RuntimeActionRegistry();

      registry.register({
        name: 'action-a',
        description: 'First action',
        inputSchema: z.object({}),
        async execute() { return {}; },
      });
      registry.register({
        name: 'action-b',
        description: 'Second action',
        inputSchema: z.object({}),
        async execute() { return {}; },
      });

      const actions = registry.describe();
      expect(actions).toHaveLength(2);
      expect(actions.map((a) => a.name)).toContain('action-a');
      expect(actions.map((a) => a.name)).toContain('action-b');
    });
  });

  describe('execute', () => {
    it('executes a registered action and returns the output', async () => {
      const registry = new RuntimeActionRegistry();
      registry.register({
        name: 'add',
        description: 'Adds two numbers',
        inputSchema: z.object({
          a: z.number(),
          b: z.number(),
        }),
        async execute(input) {
          return { result: input.a + input.b };
        },
      });

      const result = await registry.execute(
        'add',
        { a: 2, b: 3 },
        { runtimeId: 'runtime-1', stepId: 'step-1', stepNumber: 1 },
      );

      expect(result.name).toBe('add');
      expect(result.output).toEqual({ result: 5 });
    });

    it('executes a registered action mid-execution after dynamic registration', async () => {
      const registry = new RuntimeActionRegistry();

      // Register an initial action
      registry.register({
        name: 'init-action',
        description: 'Initial action',
        inputSchema: z.object({}),
        async execute() { return { ok: true }; },
      });

      // Simulate execution step 1
      const step1Result = await registry.execute(
        'init-action',
        {},
        { runtimeId: 'runtime-1', stepId: 'step-1', stepNumber: 1 },
      );
      expect(step1Result.output).toEqual({ ok: true });
      expect(registry.describe()).toHaveLength(1);

      // Simulate mid-execution dynamic registration
      registry.register({
        name: 'dynamic-action',
        description: 'Registered mid-execution',
        inputSchema: z.object({ query: z.string() }),
        async execute(input) {
          return { found: input.query.length };
        },
      });

      // Verify the newly registered action is discoverable
      const actions = registry.describe();
      expect(actions).toHaveLength(2);
      expect(actions.map((a) => a.name)).toContain('dynamic-action');

      // Execute the dynamically registered action
      const step2Result = await registry.execute(
        'dynamic-action',
        { query: 'test' },
        { runtimeId: 'runtime-1', stepId: 'step-2', stepNumber: 2 },
      );

      expect(step2Result.name).toBe('dynamic-action');
      expect(step2Result.output).toEqual({ found: 4 });
    });

    it('throws when executing an action that was never registered', async () => {
      const registry = new RuntimeActionRegistry();

      await expect(
        registry.execute(
          'nonexistent',
          {},
          { runtimeId: 'runtime-1', stepId: 'step-1', stepNumber: 1 },
        ),
      ).rejects.toThrow('Unknown action: nonexistent');
    });

    it('persists registered actions for the lifetime of the registry', async () => {
      const registry = new RuntimeActionRegistry();

      registry.register({
        name: 'persisted',
        description: 'Stays registered',
        inputSchema: z.object({}),
        async execute() { return { ok: true }; },
      });

      // No public unregister exists, so verify the action remains callable
      const result = await registry.execute(
        'persisted',
        {},
        { runtimeId: 'runtime-1', stepId: 'step-1', stepNumber: 1 },
      );

      expect(result.output).toEqual({ ok: true });
    });
  });

  describe('describe', () => {
    it('returns empty array when no actions are registered', () => {
      const registry = new RuntimeActionRegistry();
      expect(registry.describe()).toHaveLength(0);
    });

    it('produces inputSchemaText as JSON schema for each action', () => {
      const registry = new RuntimeActionRegistry();
      registry.register({
        name: 'search',
        description: 'Search for a term',
        inputSchema: z.object({
          term: z.string(),
          limit: z.number().optional(),
        }),
        async execute() { return { results: [] }; },
      });

      const actions = registry.describe();
      // zodToJsonSchema produces a JSON Schema string — verify it's valid JSON
      expect(() => JSON.parse(actions[0].inputSchemaText)).not.toThrow();
      expect(actions[0].inputSchemaText).toContain('$schema');
    });

    it('reflects newly registered actions after previous describe() calls', () => {
      const registry = new RuntimeActionRegistry();

      const initial = registry.describe();
      expect(initial).toHaveLength(0);

      registry.register({
        name: 'step-action',
        description: 'Added during execution',
        inputSchema: z.object({}),
        async execute() { return {}; },
      });

      const after = registry.describe();
      expect(after).toHaveLength(1);
      expect(after[0].name).toBe('step-action');
    });
  });
});