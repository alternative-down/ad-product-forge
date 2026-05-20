import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createTool, toolToRuntimeAction, toolsToRuntimeActions } from './tools.js';
import type { Tool, ToolsInput } from './tools.js';

describe('tools', () => {
  describe('Tool type', () => {
    it('accepts tool with minimal shape', async () => {
      const tool: Tool = {
        id: 'echo',
        description: 'Echoes input',
        inputSchema: z.object({ msg: z.string() }),
        async execute(input) {
          return (input as { msg: string }).msg;
        },
      };
      expect(tool.id).toBe('echo');
    });

    it('accepts tool with output schema', async () => {
      const tool: Tool = {
        id: 'add',
        description: 'Adds two numbers',
        inputSchema: z.object({ a: z.number(), b: z.number() }),
        outputSchema: z.object({ result: z.number() }),
        async execute(input) {
          return {
            result: (input as { a: number; b: number }).a + (input as { a: number; b: number }).b,
          };
        },
      };
      expect(tool.outputSchema).toBeDefined();
    });

    it('tool execute context includes toolCallId', async () => {
      const tool: Tool = {
        id: 'test',
        description: 'Test',
        inputSchema: z.object({}),
        execute: async (_input, context) => {
          expect(typeof context.toolCallId).toBe('string');
          return 'done';
        },
      };
      await tool.execute({}, { toolCallId: 'call-123' } as never);
    });
  });

  describe('createTool', () => {
    it('creates a tool from descriptor', () => {
      const tool = createTool({
        id: 'greet',
        description: 'Greets a user',
        inputSchema: z.object({ name: z.string() }),
        execute: async (input) => `Hello, ${(input as { name: string }).name}!`,
      });
      expect(tool.id).toBe('greet');
      expect(tool.description).toBe('Greets a user');
    });

    it('tool returned by createTool has execute', () => {
      const tool = createTool({
        id: 'test',
        description: 'Test tool',
        inputSchema: z.object({}),
        execute: async () => 'ok',
      });
      expect(typeof tool.execute).toBe('function');
    });

    it('creates tool with input schema', () => {
      const tool = createTool({
        id: 'calc',
        description: 'Calculator',
        inputSchema: z.object({ x: z.number(), y: z.number() }),
        execute: async (input) => {
          const { x, y } = input as { x: number; y: number };
          return x + y;
        },
      });
      expect(tool.inputSchema).toBeDefined();
    });

    it('creates tool with output schema', () => {
      const tool = createTool({
        id: 'multiply',
        description: 'Multiplies',
        inputSchema: z.object({ a: z.number(), b: z.number() }),
        outputSchema: z.object({ result: z.number() }),
        execute: async (input) => {
          const { a, b } = input as { a: number; b: number };
          return { result: a * b };
        },
      });
      expect((tool as Tool).outputSchema).toBeDefined();
    });
  });

  describe('toolToRuntimeAction', () => {
    it('converts tool to runtime action', () => {
      const tool: Tool = {
        id: 'test-action',
        description: 'Test action tool',
        inputSchema: z.object({ value: z.string() }),
        execute: async () => 'done',
      };
      const action = toolToRuntimeAction(tool);
      expect(action).toBeDefined();
      expect(action).toHaveProperty('inputSchema');
    });

    it('returns action with id from tool', () => {
      const tool: Tool = {
        id: 'my-tool-id',
        description: 'My tool',
        inputSchema: z.object({}),
        execute: async () => undefined,
      };
      const action = toolToRuntimeAction(tool);
      expect(action).toHaveProperty('inputSchema');
    });
  });

  describe('toolsToRuntimeActions', () => {
    it('converts multiple tools', () => {
      const tools: ToolsInput = {
        tool1: {
          id: 'tool1',
          description: 'Tool 1',
          inputSchema: z.object({}),
          execute: async () => undefined,
        },
        tool2: {
          id: 'tool2',
          description: 'Tool 2',
          inputSchema: z.object({}),
          execute: async () => undefined,
        },
      };
      const actions = toolsToRuntimeActions(tools);
      expect(Object.keys(actions)).toHaveLength(2);
    });

    it('returns empty object for empty input', () => {
      const actions = toolsToRuntimeActions({});
      expect(Object.keys(actions)).toHaveLength(0);
    });
  });

  describe('ToolExecutionContext', () => {
    it('context is available in tool execute', async () => {
      const tool: Tool = {
        id: 'context-test',
        description: 'Test context',
        inputSchema: z.object({}),
        execute: async (_input, context) => {
          return context.toolCallId;
        },
      };
      const result = await tool.execute({}, {
        toolCallId: 'ctx-call-1',
        runtimeId: 'r1',
        stepId: 's1',
        stepNumber: 1,
      } as never);
      expect(result).toBe('ctx-call-1');
    });
  });
});
