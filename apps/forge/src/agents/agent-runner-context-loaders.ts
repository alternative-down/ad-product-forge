// fallow-ignore-file unused-file  // runtime-loaded by agent-runner.ts

/**
 * Agent Context Loading - extracted from agent-runner.ts (#1718)
 * Functions for loading agent workspace context and schedule summaries
 */

import {  errorMsg } from './agent-runner-error-formatting';
import { forgeDebug } from '@forge-runtime/core';
import { eq, and } from 'drizzle-orm';
import { withTimeout } from '../utils/async';
import { agentSchedules } from '../database/schema';

import type { Database } from '../database/schema';
import type { InternalAgentRuntime } from './runtime/types';
import { AGENT_CONTEXT_WARNING_CHAR_LIMIT, AGENT_CONTEXT_FILE_PATH } from '../utils/constants';

const CONTEXT_DECORATION_TIMEOUT_MS = 5_000;

export async function loadAgentContextInstructions(
  currentRuntime: InternalAgentRuntime,
  db: Database,
) {
  const filesystem = currentRuntime.workspace.filesystem;
  const agentContextContent = await loadAgentContextContent(filesystem);
  const scheduleSummary = await loadActiveScheduleSummary(db, currentRuntime.id);

  const sections: Array<string | null> = [scheduleSummary, agentContextContent];

  const filtered = sections.filter((v): v is string => Boolean(v));
  if (filtered.length === 0) {
    return undefined;
  }

  const _lines: Array<string | null> = [
    ...(scheduleSummary !== null && scheduleSummary !== undefined
      ? ['Automatically loaded active schedule context.', '']
      : []),
    ...(agentContextContent !== null && agentContextContent !== undefined
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
        .where(and(eq(agentSchedules.agentId, runtimeId), eq(agentSchedules.isActive, 1)))
        .limit(20)
        .all(),
      5_000,
      'Active schedule summary lookup timed out',
    );

    type ScheduleRow = {
      name: string | null;
      cronExpression: string | null;
      timezone: string | null;
    };

    if ((rows as ScheduleRow[]).length === 0) {
      return null;
    }

    const lines = (rows as ScheduleRow[]).map(
      (s: ScheduleRow) => {
        const cron = s.cronExpression ?? '';
        const tz = s.timezone ?? 'UTC';
        const name = s.name ?? '(unnamed)';
        return `  ${name}: "${cron}" [${tz}]`;
      },
    );

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
      message: 'Failed to load active schedule summary: ' + errorMsg(err),
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
  ).catch((err) => {
    forgeDebug({
      scope: 'agent-runner',
      level: 'error',
      message: '[safe-catch] context decoration check',
      context: { error: errorMsg(err) },
    });
    return false;
  });

  if (!exists) {
    return null;
  }

  const content = await withTimeout(
    filesystem.readFile(AGENT_CONTEXT_FILE_PATH),
    CONTEXT_DECORATION_TIMEOUT_MS,
    `Agent context read timed out for filesystem`,
  ).catch((err) => {
    forgeDebug({
      scope: 'agent-runner',
      level: 'error',
      message: '[safe-catch] context decoration read',
      context: { error: errorMsg(err) },
    });
    return null;
  });

  if (content == null) {
    return null;
  }

  const text = typeof content === 'string' ? content : content.toString('utf-8');
  if (text.length > AGENT_CONTEXT_WARNING_CHAR_LIMIT) {
    return (
      text.slice(0, AGENT_CONTEXT_WARNING_CHAR_LIMIT) +
      `\n\n[... truncated ${text.length - AGENT_CONTEXT_WARNING_CHAR_LIMIT} chars, full context in workspace file]`
    );
  }
  return text;
}