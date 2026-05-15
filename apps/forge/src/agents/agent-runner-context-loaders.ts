// fallow-ignore-file unused-file  // runtime-loaded by agent-runner.ts

/**
 * Agent Context Loading - extracted from agent-runner.ts (#1718)
 * Functions for loading agent workspace context and schedule summaries
 */

import { forgeDebug } from '@forge-runtime/core';
import { eq, and } from 'drizzle-orm';
import { withTimeout } from '../utils/async';
import { agentSchedules } from '../database/schema';

import type {Database} from '../database/schema';
import type { InternalAgentRuntime } from './runtime/types';
import {
  AGENT_CONTEXT_WARNING_CHAR_LIMIT,
  AGENT_CONTEXT_FILE_PATH,
} from '../utils/constants';

const CONTEXT_DECORATION_TIMEOUT_MS = 5_000;

export async function loadAgentContextInstructions(
  currentRuntime: InternalAgentRuntime,
  db: Database,
) {
  const filesystem = currentRuntime.workspace.filesystem;
  const agentContextContent = await loadAgentContextContent(filesystem);
  const scheduleSummary = await loadActiveScheduleSummary(db, currentRuntime.id);

  const sections: Array<string | null> = [
    scheduleSummary,
    agentContextContent,
  ];

  const filtered = sections.filter((v): v is string => Boolean(v));
  if (filtered.length === 0) {
    return undefined;
  }

  const lines: Array<string | null> = [
    ...(scheduleSummary ? ['Automatically loaded active schedule context.', ''] : []),
    ...(agentContextContent
      ? [
          'Automatically loaded workspace context file.',
          `File: ${AGENT_CONTEXT_FILE_PATH}`,
          'This file should be treated as additional runtime instructions and context.',
          'This is the only workspace file auto-loaded into the execution context.',
          'Treat it as a concise summary layer. Keep details in other files and store only high-signal references here when needed.',
          'If you mention or use information from this file, do not say it came from context, instructions, notes, or memory. Use active language such as "I remember that...", "we already saw that...", or "on day X in the morning I did X" when appropriate.',
          '',
        ]
      : []),
    agentContextContent ?? null,
  ].filter(Boolean);

  return filtered.join('\n\n');
}

export async function loadActiveScheduleSummary(db: Database, runtimeId: string) {
  try {
    const rows = await withTimeout(
      db
        .select({
          name: agentSchedules.name,
          cronExpression: agentSchedules.cronExpression,
          timezone: agentSchedules.timezone,
        })
        .from(agentSchedules)
        .where(
          and(
            eq(agentSchedules.agentId, runtimeId),
            eq(agentSchedules.isActive, 1),
          ),
        )
        .limit(20),
      5_000,
      'Active schedule summary lookup timed out',
    );

    if (rows.length === 0) {
      return null;
    }

    const lines = rows.map((s: { id: string; name?: string; cronExpression?: string; timezone?: string }) => {
      const cron = s.cronExpression ?? '';
      const tz = s.timezone ?? 'UTC';
      const name = s.name ?? '(unnamed)';
      return `  ${name}: "${cron}" [${tz}]`;
    });

    return [
      '## Active Schedules',
      '',
      'Your active recurring schedules (only show when triggered):',
      '',
      ...lines,
    ].join('\n');
  } catch (err) {
    forgeDebug({
      scope: 'agent-runner',
      level: 'warn',
      runtimeId,
      message: 'Failed to load active schedule summary: ' + (err instanceof Error ? err.message : String(err)),
    });
    return null;
  }
}

export async function loadAgentContextContent(
  filesystem: InternalAgentRuntime['workspace']['filesystem'],
) {
  if (!filesystem) {
    return null;
  }

  const exists = await withTimeout(
    filesystem.exists(AGENT_CONTEXT_FILE_PATH),
    CONTEXT_DECORATION_TIMEOUT_MS,
    `Agent context existence check timed out for filesystem`,
  ).catch((err) => { forgeDebug({ scope: 'agent-runner', level: 'error', message: '[safe-catch] context decoration check', context: { error: err instanceof Error ? err.message : String(err) } }); return false; });

  if (!exists) {
    return null;
  }

  const data = await withTimeout(
    filesystem.readFile(AGENT_CONTEXT_FILE_PATH),
    CONTEXT_DECORATION_TIMEOUT_MS,
    `Agent context read timed out for filesystem`,
  ).catch((err) => { forgeDebug({ scope: 'agent-runner', level: 'error', message: '[safe-catch] context decoration read', context: { error: err instanceof Error ? err.message : String(err) } }); return null; });

  if (!data) {
    return null;
  }

  const content = typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return null;
  }

  if (trimmedContent.length > AGENT_CONTEXT_WARNING_CHAR_LIMIT) {
    return [
      'Context pressure warning:',
      `- \`${AGENT_CONTEXT_FILE_PATH}\` is getting large (${trimmedContent.length} chars).`,
      '- Keep only high-signal summary context there.',
      '- Move detailed notes, logs, and long task detail into separate workspace files.',
      '- Leave short retrieval hints and file references in `AGENT_CONTEXT.md`.',
      '',
      trimmedContent,
    ].join('\n');
  }

  return trimmedContent;
}