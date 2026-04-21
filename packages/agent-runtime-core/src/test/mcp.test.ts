import { describe, expect, it } from 'vitest';

import { mcpJsonSchemaToZod } from '../integrations/mcp/json-schema.js';
import { createMcpActionDefinitions } from '../integrations/mcp/runtime-actions.js';

describe('mcpJsonSchemaToZod', () => {
  it('converts object schemas with required and optional properties', () => {
    const schema = mcpJsonSchemaToZod({
      type: 'object',
      properties: {
        query: { type: 'string' },
        topK: { type: 'number' },
      },
      required: ['query'],
    });
    const parsed = schema.parse({
      query: 'hello',
      topK: 3,
    });

    expect(parsed).toEqual({
      query: 'hello',
      topK: 3,
    });
    expect(() => schema.parse({ topK: 3 })).toThrow();
  });
});

describe('createMcpActionDefinitions', () => {
  it('maps listed tools into runtime action definitions', async () => {
    const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
    const session = {
      async listTools() {
        return [{
          name: 'search_docs',
          description: 'Search docs.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
          },
        }];
      },
      async callTool(name: string, input: Record<string, unknown>) {
        calls.push({ name, input });
        return {
          ok: true,
        };
      },
      async close() {
        return;
      },
    };

    const definitions = await createMcpActionDefinitions(session);
    const output = await definitions[0]!.execute({
      query: 'runtime',
    }, {
      runtimeId: 'runtime-1',
      stepId: 'step-1',
      stepNumber: 1,
    });

    expect(definitions[0]!.name).toBe('search_docs');
    expect(calls).toEqual([{
      name: 'search_docs',
      input: {
        query: 'runtime',
      },
    }]);
    expect(output).toEqual({
      ok: true,
    });
  });
});
