import type { ConversationMessage } from 'agent-runtime-core/integrations';

function formatObserverDate(createdAt: Date | undefined) {
  return createdAt
    ? `${createdAt.toLocaleDateString('en-US', {
        month: 'short',
      })} ${createdAt.getDate()} ${createdAt.getFullYear()}`
    : '';
}

function formatObserverTime(createdAt: Date | undefined) {
  return createdAt
    ? createdAt.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : '';
}

function normalizeCreatedAt(createdAt: string | undefined) {
  if (!createdAt) {
    return undefined;
  }

  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatObserverPartLine(title: string, body: string, time: string | undefined, previousTime: string | undefined) {
  const timeLabel = time && time !== previousTime ? ` (${time})` : '';
  return `${title}${timeLabel}: ${body}`;
}

function formatObserverLines(lines: Array<{
  date: string;
  time: string;
  title: string;
  body: string;
}>) {
  const output: string[] = [];
  let previousDate: string | undefined;
  let previousTime: string | undefined;

  for (const line of lines) {
    if (line.date && line.date !== previousDate) {
      output.push(`Date: ${line.date}`);
      previousDate = line.date;
      previousTime = undefined;
    }

    output.push(formatObserverPartLine(line.title, line.body, line.time, previousTime));
    previousTime = line.time || previousTime;
  }

  return output.join('\n');
}

function formatConversationMessage(message: ConversationMessage) {
  const messageCreatedAt = normalizeCreatedAt(message.createdAt);
  const titleBase = message.role.charAt(0).toUpperCase() + message.role.slice(1);
  const lines: Array<{
    date: string;
    time: string;
    title: string;
    body: string;
  }> = [];
  const pushLine = (title: string, body: string | undefined, createdAt?: string) => {
    const normalizedBody = body?.trim();

    if (!normalizedBody) {
      return;
    }

    const date = normalizeCreatedAt(createdAt) ?? messageCreatedAt;

    lines.push({
      date: formatObserverDate(date),
      time: formatObserverTime(date),
      title,
      body: normalizedBody,
    });
  };

  for (const part of message.parts) {
    if (part.type === 'text') {
      pushLine(titleBase, part.text, message.createdAt);
      continue;
    }

    if (part.type === 'reasoning') {
      pushLine('Reasoning', part.text, message.createdAt);
    }
  }

  const toolInvocations = Array.isArray(message.metadata?.toolInvocations)
    ? message.metadata.toolInvocations
    : [];

  for (const toolInvocation of toolInvocations) {
    if (typeof toolInvocation !== 'object' || toolInvocation === null) {
      continue;
    }

    pushLine(
      `Tool Call ${typeof toolInvocation.toolName === 'string' ? toolInvocation.toolName : 'unknown'}`,
      JSON.stringify(toolInvocation.args ?? {}, null, 2),
      message.createdAt,
    );
  }

  const toolResults = Array.isArray(message.metadata?.toolResults)
    ? message.metadata.toolResults
    : [];

  for (const toolResult of toolResults) {
    if (typeof toolResult !== 'object' || toolResult === null) {
      continue;
    }

    pushLine(
      `Tool Result ${typeof toolResult.toolName === 'string' ? toolResult.toolName : 'unknown'}`,
      JSON.stringify(toolResult.result ?? null, null, 2),
      message.createdAt,
    );
  }

  return formatObserverLines(lines);
}

function formatMessagesForObserver(messages: ConversationMessage[]) {
  return messages
    .map((message) => formatConversationMessage(message))
    .filter(Boolean)
    .join('\n');
}

export function buildObserverSystemPrompt() {
  return [
    'You are the memory consciousness of an AI assistant. Your observations will be the ONLY information the assistant has about past interactions with this user.',
    '',
    'Extract observations that will help the assistant remember:',
    '',
    '- User preferences, identity details, and stable facts',
    '- Concrete decisions, active work, blockers, dependencies, and next actions',
    '- Ongoing tasks the assistant is currently handling',
    '- Suggested next response when the assistant should answer the user',
    '',
    '=== OUTPUT FORMAT ===',
    '',
    'Your output MUST use XML tags to structure the response.',
    '',
    '<observations>',
    'Date: Dec 4 2025',
    '* 🔴 (2:30 PM) User prefers direct answers',
    '* 🔴 (2:31 PM) Working on feature X',
    '</observations>',
    '',
    '<current-task>',
    'What the agent is currently working on',
    '</current-task>',
    '',
    '<suggested-response>',
    'Hint for the agent\'s next message',
    '</suggested-response>',
    '',
    'Remember: these observations are the assistant\'s only memory. Make them count.',
  ].join('\n');
}

function buildObserverTaskPrompt(existingObservations?: string) {
  let prompt = '';

  if (existingObservations?.trim()) {
    prompt += [
      '## Previous Observations',
      '',
      existingObservations.trim(),
      '',
      '---',
      '',
      'Do not repeat these existing observations. Your new observations will be appended to the existing observations.',
      '',
    ].join('\n');
  }

  prompt += [
    '## Your Task',
    '',
    'Extract new observations from the message history above.',
    'Do not repeat observations that are already in the previous observations.',
    'Add your new observations in the format specified in your instructions.',
  ].join('\n');

  return prompt;
}

function buildObserverTaskUserMessage(existingObservations?: string) {
  return buildObserverTaskPrompt(existingObservations);
}

export function buildObserverPrompt(existingObservations: string | undefined, messagesToObserve: ConversationMessage[]) {
  return [
    '## New Message History to Observe',
    '',
    formatMessagesForObserver(messagesToObserve),
    '',
    '---',
    '',
    buildObserverTaskPrompt(existingObservations),
  ].join('\n');
}

export function parseObserverOutput(output: string) {
  if (detectDegenerateRepetition(output)) {
    return {
      observations: '',
      currentTask: undefined,
      suggestedContinuation: undefined,
      rawOutput: output,
      degenerate: true,
    };
  }

  const observationsMatches = [...output.matchAll(/^[ \t]*<observations>([\s\S]*?)^[ \t]*<\/observations>/gim)];
  const currentTaskMatch = output.match(/^[ \t]*<current-task>([\s\S]*?)^[ \t]*<\/current-task>/im);
  const suggestedResponseMatch = output.match(/^[ \t]*<suggested-response>([\s\S]*?)^[ \t]*<\/suggested-response>/im);
  const observations = observationsMatches.length > 0
    ? observationsMatches
      .map((match) => match[1]?.trim() ?? '')
      .filter(Boolean)
      .join('\n')
    : extractListItemsOnly(output);

  return {
    observations: sanitizeObservationLines(observations),
    currentTask: currentTaskMatch?.[1]?.trim() || undefined,
    suggestedContinuation: suggestedResponseMatch?.[1]?.trim() || undefined,
    rawOutput: output,
  };
}

function extractListItemsOnly(content: string) {
  return content
    .split('\n')
    .filter((line) => /^\s*[-*]\s/.test(line) || /^\s*\d+\.\s/.test(line))
    .join('\n')
    .trim();
}

function sanitizeObservationLines(observations: string) {
  if (!observations) {
    return observations;
  }

  const maxObservationLineChars = 10_000;
  const lines = observations.split('\n');
  let changed = false;

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].length <= maxObservationLineChars) {
      continue;
    }

    lines[index] = `${lines[index].slice(0, maxObservationLineChars)} ... [truncated]`;
    changed = true;
  }

  return changed ? lines.join('\n') : observations;
}

function detectDegenerateRepetition(text: string) {
  if (!text || text.length < 2_000) {
    return false;
  }

  const windowSize = 200;
  const step = Math.max(1, Math.floor(text.length / 50));
  const seen = new Map<string, number>();
  let duplicateWindows = 0;
  let totalWindows = 0;

  for (let index = 0; index + windowSize <= text.length; index += step) {
    const window = text.slice(index, index + windowSize);

    totalWindows += 1;
    const count = (seen.get(window) ?? 0) + 1;
    seen.set(window, count);

    if (count > 1) {
      duplicateWindows += 1;
    }
  }

  if (totalWindows > 5 && duplicateWindows / totalWindows > 0.4) {
    return true;
  }

  return text.split('\n').some((line) => line.length > 50_000);
}

function buildReflectorSystemPrompt() {
  return [
    'You consolidate batches of observations into a durable reflection.',
    'Preserve concrete facts, decisions, active work, unresolved risks, and anything that would matter later.',
    'Do not drop operational detail that would still matter for continuity.',
    'Write descriptively and clearly — do not compress or truncate important context.',
    'Return XML with a single <observations>...</observations> block.',
  ].join('\n');
}

function buildReflectorPrompt(observations: string) {
  return [
    'Consolidate the observations below into a clear, detailed reflection.',
    'Preserve all facts, decisions, and operational details — do not remove content.',
    'Write descriptively and avoid dropping important context.',
    '',
    '<observations>',
    observations,
    '</observations>',
  ].join('\n');
}

function buildReflectorTaskUserMessage() {
  return [
    'Consolidate the observations below into a clear, detailed reflection.',
    'Preserve all facts, decisions, and operational details — do not remove content.',
    'Return XML with a single <observations>...</observations> block.',
  ].join('\n');
}

function parseReflectorOutput(output: string) {
  const match = output.match(/<observations>([\s\S]*?)<\/observations>/i);

  return {
    observations: (match?.[1] ?? output).trim(),
  };
}
