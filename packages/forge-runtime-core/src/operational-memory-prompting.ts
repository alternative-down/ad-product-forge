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

export function formatMessagesForObserver(messages: ConversationMessage[]) {
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
  const observationsMatch = output.match(/<observations>([\s\S]*?)<\/observations>/i);
  const currentTaskMatch = output.match(/<current-task>([\s\S]*?)<\/current-task>/i);
  const suggestedResponseMatch = output.match(/<suggested-response>([\s\S]*?)<\/suggested-response>/i);

  return {
    observations: (observationsMatch?.[1] ?? '').trim(),
    currentTask: currentTaskMatch?.[1]?.trim() || undefined,
    suggestedContinuation: suggestedResponseMatch?.[1]?.trim() || undefined,
    rawOutput: output,
  };
}

export function buildReflectorSystemPrompt() {
  return [
    'You compress batches of observations into a smaller durable reflection.',
    'Preserve concrete facts, decisions, active work, unresolved risks, and anything that would matter later.',
    'Do not drop operational detail that would still matter for continuity.',
    'Return XML with a single <observations>...</observations> block.',
  ].join('\n');
}

export function buildReflectorPrompt(observations: string) {
  return [
    'Compress the observations below into a tighter reflection.',
    'Preserve the important details while removing redundancy.',
    '',
    '<observations>',
    observations,
    '</observations>',
  ].join('\n');
}

export function parseReflectorOutput(output: string) {
  const match = output.match(/<observations>([\s\S]*?)<\/observations>/i);

  return {
    observations: (match?.[1] ?? output).trim(),
  };
}
