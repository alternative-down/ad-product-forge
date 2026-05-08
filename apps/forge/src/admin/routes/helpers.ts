import { forgeDebug } from '@forge-runtime/core';
import { access } from 'node:fs/promises';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createClient } from '@libsql/client';
import { LibsqlConversationStore, toMastraSafeIdentifier } from '@forge-runtime/core';

import type {Database} from '../../database/schema';
import {
  agentCheckpointedOmStates,
  agentLongTermMemoryStates,
  agentLongTermMemoryRecallStates,
} from '../../database/schema';

export function normalizeOptionalText(value?: string): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function normalizeJsonText(
  value: string | undefined,
  fieldName: string,
  expectedShape: 'array' | 'object',
): string | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  const parsed = JSON.parse(normalized);
  const valid =
    expectedShape === 'array'
      ? Array.isArray(parsed)
      : typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);

  if (!valid) {
    forgeDebug({ scope: 'admin-routes-helpers', level: 'warn', message: 'validateJsonBody: invalid shape', context: { fieldName, expectedShape } });
    throw new Error(`${fieldName} must be a JSON ${expectedShape}`);
  }

  return JSON.stringify(parsed);
}

export function parseJsonBody<TSchema extends z.ZodTypeAny>(
  bodyText: string,
  schema: TSchema,
): z.infer<TSchema> {
  const parsed = bodyText.trim().length === 0 ? {} : JSON.parse(bodyText);
  return schema.parse(parsed);
}

export function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

export function summarizeHealthcheckThreadMessage(message: {
  id: string;
  role: string;
  createdAt: number;
  type: string | null;
  content?: unknown;
}) {
  const content = message.content && typeof message.content === 'object'
    ? message.content as {
        content?: unknown;
        reasoning?: unknown;
        parts?: unknown;
      }
    : null;
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const partTypes = parts
    .flatMap((part) =>
      part && typeof part === 'object' && 'type' in part && typeof part.type === 'string'
        ? [part.type]
        : [])
    .slice(0, 20);
  const preview = extractLatestHealthcheckMessagePreview(message.content);
  const hasReasoning =
    typeof content?.reasoning === 'string' && content.reasoning.trim().length > 0
    || parts.some((part) =>
      part && typeof part === 'object' && 'type' in part && part.type === 'reasoning');

  return {
    id: message.id,
    role: message.role,
    createdAt: message.createdAt,
    type: message.type,
    preview,
    hasReasoning,
    partTypes,
  };
}

export function extractLatestHealthcheckMessagePreview(content: unknown): string | null {
  if (!content || typeof content !== 'object') {
    return null;
  }

  const record = content as {
    content?: unknown;
    reasoning?: unknown;
    parts?: unknown;
  };
  const parts = Array.isArray(record.parts) ? record.parts : [];

  for (const part of [...parts].reverse()) {
    if (
      part
      && typeof part === 'object'
      && 'type' in part
      && 'text' in part
      && (part.type === 'text' || part.type === 'reasoning')
      && typeof part.text === 'string'
      && part.text.trim()
    ) {
      return part.text.trim().slice(0, 280);
    }
  }

  if (typeof record.content === 'string' && record.content.trim()) {
    return record.content.trim().slice(0, 280);
  }

  if (typeof record.reasoning === 'string' && record.reasoning.trim()) {
    return record.reasoning.trim().slice(0, 280);
  }

  return null;
}

export function summarizeActiveItems(items: unknown[]): Array<{ name: string; count: number }> {
  const summary = new Map<string, number>();

  for (const item of items) {
    const name = typeof item === 'object' && item !== null && 'constructor' in item
      ? (item as { constructor?: { name?: string } }).constructor?.name ?? 'unknown'
      : typeof item;

    summary.set(name, (summary.get(name) ?? 0) + 1);
  }

  return Array.from(summary.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count);
}

export async function fsPathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (err) {
    forgeDebug({ scope: 'helpers', level: 'warn', message: '[helpers] fsPathExists failed', context: { error: err instanceof Error ? err.message : String(err) }});
    // Safe: path does not exist — return false to signal absence
    return false;
  }
}

/**
 * Clears agent conversation history and optionally long-term memory.
 * Extracted from routes.ts for use by registerAgentWriteRoutes.
 */
export async function clearAgentHistory(opts: {
  db: Database;
  workspaceBasePath: string;
  agentId: string;
  includeLongTermMemoryThread?: boolean;
}): Promise<void> {
  const { db, workspaceBasePath, agentId, includeLongTermMemoryThread } = opts;

  const agentDatabasePath = `${workspaceBasePath}/${agentId}/database.db`;
  const client = createClient({ url: `file:${agentDatabasePath}` });
  const mastraAgentId = toMastraSafeIdentifier(agentId);
  const conversationStore = new LibsqlConversationStore({
    client,
    tablePrefix: mastraAgentId,
  });

  await conversationStore.clearThread(mastraAgentId);

  if (includeLongTermMemoryThread) {
    await db.delete(agentCheckpointedOmStates).where(eq(agentCheckpointedOmStates.agentId, agentId));
    await db.delete(agentLongTermMemoryStates).where(eq(agentLongTermMemoryStates.agentId, agentId));
    await db.delete(agentLongTermMemoryRecallStates).where(eq(agentLongTermMemoryRecallStates.agentId, agentId));
  }
}