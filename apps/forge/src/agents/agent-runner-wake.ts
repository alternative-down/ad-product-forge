import type { AgentWakeEvent } from '@forge-runtime/core';


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
    messageId !== undefined ? `[messageId: ${messageId}]` : '',
    actor !== undefined
      ? actorKey !== undefined
        ? `${actor} (${actorKey})`
        : actor
      : '',
  ]
    .filter(Boolean)
    .join('');

  const suffix = attachments !== undefined ? ` (attachments: ${attachments})` : '';

  return formatWakeItemText({
    label,
    text,
    suffix,
    isMultiline: text.includes('\n'),
    actor,
  });
}

function formatWakeItemText({
  label,
  text,
  suffix,
  isMultiline,
  actor,
}: {
  label: string;
  text: string;
  suffix: string;
  isMultiline: boolean;
  actor: string;
}): string {
  if (actor) {
    return `${label}${isMultiline ? ':\n' : ': '}${text}${suffix}`;
  }

  const joiner = isMultiline ? '\n' : ' ';
  return [label, `${text}${suffix}`.trim()].filter(Boolean).join(joiner).trim();
}

function describeWakeGroup(event: AgentWakeEvent) {
  if (event.type.startsWith('message:')) {
    const targetKey = normalizeProviderCode(event.groupMetadata?.TargetKey) ?? event.groupKey;
    const lines = [
      ...(event.groupMetadata?.Provider !== undefined
        ? [`provider: ${event.groupMetadata.Provider}`]
        : []),
      `targetKey: ${targetKey}`,
    ];

    if (event.groupMetadata?.ConversationType === 'group') {
      lines.push('conversationType: group');
    }

    if (event.groupMetadata?.ConversationName !== undefined) {
      lines.push(`conversationName: ${event.groupMetadata.ConversationName}`);
    }

    if (event.groupMetadata?.Participants !== undefined) {
      lines.push(`participants: ${event.groupMetadata.Participants}`);
    }

    return lines.join('\n');
  }

  if (event.type === 'schedule') {
    if (event.groupMetadata?.ScheduleKind === 'heartbeat') {
      return 'scheduler';
    }

    return event.groupMetadata?.ScheduleId !== undefined
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
  if (value === undefined) {
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
