import { z } from 'zod';
import type { McpJsonSchema } from './contracts.js';
export declare function mcpJsonSchemaToZod(schema: McpJsonSchema | undefined): z.ZodTypeAny;
export declare function renderMcpJsonSchemaText(schema: McpJsonSchema | undefined): string;
