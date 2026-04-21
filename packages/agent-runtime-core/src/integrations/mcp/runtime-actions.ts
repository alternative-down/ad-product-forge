import { z } from 'zod';

import type { RuntimeActionDefinition } from '../../core/actions.js';
import { mcpJsonSchemaToZod } from './json-schema.js';

import type { McpRuntimeActionOptions, McpSession } from './contracts.js';

export async function createMcpActionDefinitions(
  session: McpSession,
  options: McpRuntimeActionOptions = {},
): Promise<Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>> {
  const tools = await session.listTools();

  return tools.map((tool) => ({
    name: options.namePrefix ? `${options.namePrefix}${tool.name}` : tool.name,
    description: tool.description?.trim() || `Call MCP tool ${tool.name}.`,
    inputSchema: toRuntimeActionInputSchema(tool.inputSchema),
    async execute(input) {
      return session.callTool(tool.name, input);
    },
  }));
}

function toRuntimeActionInputSchema(schema: unknown) {
  const convertedSchema = mcpJsonSchemaToZod(schema as never);

  if (convertedSchema instanceof z.ZodObject) {
    return convertedSchema as z.ZodType<Record<string, unknown>>;
  }

  return z.object({}).catchall(z.unknown());
}
