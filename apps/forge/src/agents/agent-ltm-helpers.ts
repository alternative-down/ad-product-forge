import { forgeDebug } from '@forge-runtime/core';
import { serializeError } from './agent-runner-error-formatting';

export type LtmSearchResult = {
  id: string;
  content: string;
  score?: number;
};

export function safeSerializeRecallSteps(steps: unknown[]) {
  try {
    return JSON.stringify(steps, null, 2);
  } catch (error) {
    forgeDebug({ scope: 'agent-long-term-memory-recall', level: 'warn', message: 'Failed to serialize recall steps', context: { error: error instanceof Error ? error.message : String(error) } });
    return '[unserializable steps payload]';
  }
}

export function safeSerializeGraphResult(result: unknown) {
  try {
    return JSON.stringify(result, null, 2);
  } catch (error) {
    forgeDebug({ scope: 'agent-long-term-memory-recall', level: 'warn', message: 'Failed to serialize graph result', context: { error: error instanceof Error ? error.message : String(error) } });
    return '[unserializable graph result]';
  }
}

export function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&apos;');
}

export function buildRecallSystemMessage(input: {
  query: string;
  graphHit: boolean;
  graphScore: number | null;
  graphContext: string;
  results: LtmSearchResult[];
}) {
  const items = input.graphHit
    ? (
        input.graphContext.trim()
          ? [
              `  <item source="graph" query="${escapeXml(input.query)}"${typeof input.graphScore === 'number' ? ` score="${input.graphScore.toFixed(4)}"` : ''}>${escapeXml(input.graphContext.trim())}</item>`,
            ]
          : []
      )
    : input.results.map((result) => (
      `  <item source="workspace" id="${escapeXml(result.id)}" score="${typeof result.score === 'number' ? result.score.toFixed(4) : '0.0000'}">${escapeXml(result.content)}</item>`
    ));

  if (items.length === 0) {
    return null;
  }

  return [
    `<memory-recall on-datetime="${new Date().toISOString()}">`,
    `  <instructions>${escapeXml('Now is the datetime in the on-datetime attribute. These recalled items are past information that is no longer in your active context or that your long-term memory consolidated. You may already have seen or resolved them. Use them only as additional relevant context when useful, and prefer more recent context if there is any conflict. If you mention or use this information, do not talk about memory, long-term memory, or recalled context. Use active language such as "I remember that...", "we already saw that...", or "on day X in the morning I did X" when that is appropriate.')}</instructions>`,
    ...items,
    '</memory-recall>',
  ].join('\n');
}