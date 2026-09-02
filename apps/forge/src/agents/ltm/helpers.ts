import { errorMsg } from '../error-formatting';
import { forgeDebug } from '@forge-runtime/core';

export type LtmSearchResult = {
  id: string;
  content: string;
  score?: number;
};

const RECALL_EXCERPT_MAX_LENGTH = 320;

export function buildRecallExcerpt(content: string): string {
  const paragraph = content
    .trim()
    .split(/\n\s*\n/u, 1)[0]
    ?.replace(/\s+/gu, ' ')
    .trim() ?? '';
  if (paragraph.length <= RECALL_EXCERPT_MAX_LENGTH) return paragraph;
  return `${paragraph.slice(0, RECALL_EXCERPT_MAX_LENGTH - 1).trimEnd()}…`;
}

export function safeSerializeRecallSteps(steps: unknown[]) {
  try {
    return JSON.stringify(steps, null, 2);
  } catch (error) {
    forgeDebug({
      scope: 'ltm/recall',
      level: 'warn',
      message: 'Failed to serialize recall steps',
      context: { error: errorMsg(error) },
    });
    return '[unserializable steps payload]';
  }
}

export function safeSerializeGraphResult(result: unknown) {
  try {
    return JSON.stringify(result, null, 2);
  } catch (error) {
    forgeDebug({
      scope: 'ltm/recall',
      level: 'warn',
      message: 'Failed to serialize graph result',
      context: { error: errorMsg(error) },
    });
    return '[unserializable graph result]';
  }
}

export function ltmEscapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function buildRecallSystemMessage(input: {
  query: string;
  graphHit: boolean;
  graphScore: number | null;
  graphContext: string;
  results: LtmSearchResult[];
}) {
  const graphExcerpt = buildRecallExcerpt(input.graphContext);
  const primaryResult = input.results[0];
  const path = primaryResult ? ltmEscapeXml(primaryResult.id) : null;
  const items =
    input.graphHit && graphExcerpt && path
      ? [
          `  <item source="graph" path="${path}" query="${ltmEscapeXml(input.query)}"${typeof input.graphScore === 'number' ? ` score="${input.graphScore.toFixed(4)}"` : ''}>${ltmEscapeXml(graphExcerpt)}</item>`,
        ]
      : primaryResult && path
        ? [
            `  <item source="workspace" path="${path}" score="${typeof primaryResult.score === 'number' ? primaryResult.score.toFixed(4) : '0.0000'}">${ltmEscapeXml(buildRecallExcerpt(primaryResult.content))}</item>`,
          ]
        : [];

  if (items.length === 0) {
    return null;
  }

  return [
    `<memory-recall on-datetime="${new Date().toISOString()}">`,
    `  <instructions>${ltmEscapeXml('This is a short excerpt from past context. Use it only when relevant, prefer newer information on conflicts, and read the full memory at the item path only if more detail is needed.')}</instructions>`,
    ...items,
    '</memory-recall>',
  ].join('\n');
}
