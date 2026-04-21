import { z } from 'zod';

import type { McpJsonSchema } from './contracts.js';

const defaultStringSchema = z.string();
const defaultNumberSchema = z.number();
const defaultBooleanSchema = z.boolean();
const defaultObjectSchema = z.object({}).catchall(z.unknown());
const defaultArraySchema = z.array(z.unknown());

export function mcpJsonSchemaToZod(schema: McpJsonSchema | undefined): z.ZodTypeAny {
  if (schema === undefined || schema === true) {
    return defaultObjectSchema;
  }

  if (schema === false) {
    return z.never();
  }

  if (schema.const !== undefined) {
    return z.unknown().refine((value) => value === schema.const);
  }

  if (schema.enum?.length) {
    return z.unknown().refine((value) => {
      return schema.enum!.some((candidate) => candidate === value);
    });
  }

  const typeValues = Array.isArray(schema.type)
    ? schema.type
    : schema.type
      ? [schema.type]
      : [];

  if (typeValues.length > 1) {
    return z.union(typeValues.map((typeValue) => {
      return mcpJsonSchemaToZod({
        ...schema,
        type: typeValue,
      });
    }) as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  }

  const typeValue = typeValues[0];

  if (typeValue === 'string') {
    return defaultStringSchema;
  }

  if (typeValue === 'number' || typeValue === 'integer') {
    return defaultNumberSchema;
  }

  if (typeValue === 'boolean') {
    return defaultBooleanSchema;
  }

  if (typeValue === 'array') {
    return z.array(mcpJsonSchemaToZod(schema.items));
  }

  if (typeValue === 'object' || schema.properties || schema.additionalProperties !== undefined) {
    return buildObjectSchema(schema);
  }

  return z.unknown();
}

function buildObjectSchema(schema: Exclude<McpJsonSchema, boolean>) {
  const propertyEntries = Object.entries(schema.properties ?? {}).map(([key, value]) => {
    return [key, mcpJsonSchemaToZod(value)] as const;
  });
  const required = new Set(schema.required ?? []);
  const shape = Object.fromEntries(propertyEntries.map(([key, value]) => {
    return [key, required.has(key) ? value : value.optional()];
  }));
  let objectSchema = z.object(shape);

  if (schema.additionalProperties === true || schema.additionalProperties === undefined) {
    objectSchema = objectSchema.catchall(z.unknown());
  } else if (schema.additionalProperties !== false && schema.additionalProperties !== undefined) {
    objectSchema = objectSchema.catchall(mcpJsonSchemaToZod(schema.additionalProperties));
  }

  return objectSchema;
}

export function renderMcpJsonSchemaText(schema: McpJsonSchema | undefined) {
  if (schema === undefined) {
    return '{}';
  }

  return JSON.stringify(schema, null, 2);
}
