import type { AgentWakeEvent } from '@forge-runtime/core';

export const RUN_STOP_REMINDER = [
  'System Message:',
  'A response without tool calls was detected.',
  '',
  'If you want to take any action, use your tools.',
  'Plain text responses without tool calls are ignored by the system.',
  'If you wrote a reply, answer, or update in plain text, that text was not sent to anyone.',
  'To actually deliver a message to a person, contact, group, or agent, you must call send_message successfully.',
  'Only the send_message tool result confirms that a message was delivered.',
  'XML-like text such as <tool_call>, <invoke>, <function_call>, or similar markup is still plain text and is not a real tool call.',
  '',
  'If you want to keep working, call a real tool.',
  'If you really want to stop, answer with exactly STOP_AND_IDLE and nothing else.',
  'Use NO_ACTION_NEEDED only when you want your visible text ignored and you still intend to keep working in this run.',
  '',
  'If you answer STOP_AND_IDLE:',
  '- this run stops immediately',
  '- you will not inspect, message, or act further now',
  '- your execution will stay idle until a future wake event happens',
  '',
  'Do not use STOP_AND_IDLE to skip, postpone, or ignore pending work from the current wake.',
  'If there is anything to investigate or act on now, use tools instead of answering STOP_AND_IDLE.',
  '',
  'This is an automatic system message. You do not need to reply to this message itself.',
].join('\n');

export function formatPendingRunEvents(events: AgentWakeEvent[]) {
  const groups = new Map<string, AgentWakeEvent[]>();
  const orderedEvents = [...events].sort((left, right) => left.timestamp - right.timestamp);

  for (const event of orderedEvents) {
    const existingGroup = groups.get(event.groupKey);

    if (existingGroup) {
      existingGroup.push(event);
      continue;
    }

    groups.set(event.groupKey, [event]);
  }

  return Array.from(groups.values())
    .map((groupEvents) => formatPendingRunEventGroup(groupEvents))
    .join('\n\n');
}

function formatPendingRunEventGroup(events: AgentWakeEvent[]) {
  const orderedEvents = [...events].sort((left, right) => left.timestamp - right.timestamp);
  const firstEvent = orderedEvents[0];
  const header = describeWakeGroup(firstEvent);
  const itemLines = orderedEvents.map((event) => formatPendingRunEventItem(event));

  return [header, '', ...itemLines].join('\n');
}

function formatPendingRunEventItem(event: AgentWakeEvent) {
  const timeLabel = formatWakeTime(event.timestamp);
  const messageId = normalizeProviderCode(event.itemMetadata?.MessageId);
  const actor = event.itemMetadata?.Author ?? describeWakeActor(event);
  const actorKey = event.itemMetadata?.AuthorKey;
  const attachments = event.itemMetadata?.Attachments;
  const text = event.text.trim();

  const label = [
    `[${timeLabel}]`,
    messageId !== null && messageId !== undefined ? `[messageId: ${messageId}]` : '',
    actor !== null && actor !== undefined
      ? actorKey !== null && actorKey !== undefined
        ? `${actor} (${actorKey})`
        : actor
      : '',
  ]
    .filter(Boolean)
    .join('');

  const suffix =
    attachments !== null && attachments !== undefined ? ` (attachments: ${attachments})` : '';

  if (text.includes('\n')) {
    return actor
      ? `${label}:\n${text}${suffix}`
      : `${[label, `${text}${suffix}`.trim()].filter(Boolean).join('\n')}`.trim();
  }

  return actor
    ? `${label}: ${text}${suffix}`
    : `${[label, `${text}${suffix}`.trim()].filter(Boolean).join(' ')}`.trim();
}

function describeWakeGroup(event: AgentWakeEvent) {
  if (event.type.startsWith('message:')) {
    const targetKey = normalizeProviderCode(event.groupMetadata?.TargetKey) ?? event.groupKey;
    const lines = [
      ...(event.groupMetadata?.Provider !== null && event.groupMetadata?.Provider !== undefined
        ? [`provider: ${event.groupMetadata.Provider}`]
        : []),
      `targetKey: ${targetKey}`,
    ];

    if (event.groupMetadata?.ConversationType === 'group') {
      lines.push('conversationType: group');
    }

    if (
      event.groupMetadata?.ConversationName !== null &&
      event.groupMetadata?.ConversationName !== undefined
    ) {
      lines.push(`conversationName: ${event.groupMetadata.ConversationName}`);
    }

    if (
      event.groupMetadata?.Participants !== null &&
      event.groupMetadata?.Participants !== undefined
    ) {
      lines.push(`participants: ${event.groupMetadata.Participants}`);
    }

    return lines.join('\n');
  }

  if (event.type === 'schedule') {
    if (event.groupMetadata?.ScheduleKind === 'heartbeat') {
      return 'scheduler';
    }

    return event.groupMetadata?.ScheduleId !== null && event.groupMetadata?.ScheduleId !== undefined
      ? `scheduler: ${event.groupMetadata.ScheduleId}`
      : 'scheduler';
  }

  if (event.type.startsWith('github:') || event.groupMetadata?.Source === 'github') {
    return `GitHub: ${event.groupMetadata?.EventType ?? event.groupKey}`;
  }

  if (event.type === 'role-change') {
    return `Role change: ${event.groupMetadata?.TargetAgentId ?? event.groupKey}`;
  }

  if (event.type === 'runner-reminder') {
    return 'System: runner-reminder';
  }

  return `${formatWakeLabel(event.type)}: ${event.groupKey}`;
}

function formatWakeLabel(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_:]+/g, ' ')
    .toLowerCase();
}

function normalizeProviderCode(value?: string) {
  if (value === null || value === undefined) {
    return value;
  }

  return value.replace(/^conv_/, '').replace(/^msg_/, '');
}

function describeWakeActor(event: AgentWakeEvent) {
  if (event.type === 'schedule') {
    return '';
  }

  if (event.type.startsWith('github:') || event.groupMetadata?.Source === 'github') {
    return 'GitHub';
  }

  if (event.type === 'role-change' || event.type === 'runner-reminder') {
    return 'System';
  }

  return '';
}

function formatWakeTime(timestamp: number) {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
