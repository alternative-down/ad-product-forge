/**
 * email-account helpers — extracted from createEmailProvider for testability.
 * These are pure/pure-ish functions that don't close over provider state.
 */
import { type CommunicationFile } from '@forge-runtime/core';
import type { Email } from 'postal-mime';

export function toUint8Array(value: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return new Uint8Array(Buffer.from(value, 'utf8'));
  return new Uint8Array(value);
}

export function toCommunicationAttachments(
  email: Email,
  providerMessageId: string,
): CommunicationFile[] {
  return (email.attachments ?? []).map((attachment, index) => {
    const data = toUint8Array(attachment.content);
    return {
      name: attachment.filename ?? `${providerMessageId}-${index}`,
      data,
      contentType: attachment.mimeType ?? undefined,
      sizeBytes: data.byteLength,
    };
  });
}

export function parseAddressValue(address?: Email['from']): string | null {
  if (
    !address ||
    !('address' in address) ||
    address.address === null ||
    address.address === undefined
  )
    return null;
  return address.address.toLowerCase();
}

export function parseAddressDisplayName(address?: Email['from']): string | null {
  if (!address || !('address' in address)) return null;
  return (
    (address.name !== null && address.name !== undefined ? address.name : address.address) ?? null
  );
}

export interface ParsedRecipient {
  address: string;
  displayName: string;
}

export function parseFirstRecipient(addresses?: Email['to']): ParsedRecipient | null {
  if (!addresses) return null;
  for (const address of addresses) {
    if (!('address' in address) || address.address === null || address.address === undefined)
      continue;
    return {
      address: address.address.toLowerCase(),
      displayName: address.name || address.address,
    };
  }
  return null;
}

export function filterRecentByTtl<T extends { createdAt: string | number }>(
  messages: T[],
  ttlMs: number,
  now: number = Date.now(),
): T[] {
  const cutoff = now - ttlMs;
  return messages.filter((m) => {
    const createdAtMs = typeof m.createdAt === 'string' ? Date.parse(m.createdAt) : m.createdAt;
    return createdAtMs >= cutoff;
  });
}

export function pruneRecentOutboundMessages(
  recentOutboundMessages: Map<
    string,
    Array<{
      messageId: string;
      content: string;
      attachments: CommunicationFile[];
      createdAt: string;
      unread: boolean;
      authorId: string;
      authorDisplayName: string;
      threadKey?: string;
    }>
  >,
  ttlMs: number,
  now: number = Date.now(),
): void {
  for (const [targetKey, messages] of recentOutboundMessages.entries()) {
    const visible = filterRecentByTtl(messages, ttlMs, now);
    if (visible.length === 0) {
      recentOutboundMessages.delete(targetKey);
    } else {
      recentOutboundMessages.set(targetKey, visible);
    }
  }
}


export function resolveConversationParticipant(
  email: Email,
  selfEmail: string,
): { targetKey: string; authorId: string; authorDisplayName: string } | null {
  const fromAddress = parseAddressValue(email.from);
  if (fromAddress !== null && fromAddress !== undefined && fromAddress !== selfEmail) {
    return {
      targetKey: fromAddress,
      authorId: fromAddress,
      authorDisplayName: parseAddressDisplayName(email.from) ?? fromAddress,
    };
  }
  const recipient = parseFirstRecipient(email.to);
  if (recipient) {
    return { targetKey: recipient.address, authorId: selfEmail, authorDisplayName: selfEmail };
  }
  return null;
}

export function resolveEmailThreadKey(parsed: Email): string {
  const inReplyTo = parsed.inReplyTo;
  if (
    inReplyTo !== null &&
    inReplyTo !== undefined &&
    inReplyTo.length > 0 &&
    inReplyTo[0] !== null &&
    inReplyTo[0] !== undefined
  )
    return inReplyTo[0];
  const references = parsed.references;
  if (
    references !== null &&
    references !== undefined &&
    references.length > 0 &&
    references[0] !== null &&
    references[0] !== undefined
  )
    return references[0];
  return parsed.messageId ?? `orphan-${parsed.subject ?? parsed.from?.address ?? 'no-message-id'}`;
}

export function resolveCreatedAt(email: Email): string {
  if (typeof email.date === 'string') return email.date;
  if (email.date !== null && email.date !== undefined) {
    return new Date(email.date).toISOString();
  }
  return new Date().toISOString();
}

export function extractEmailBody(email: Email): string {
  const rawContent = email.text ?? email.html?.replace(/<[^>]+>/g, '') ?? '[no content]';
  const normalizedContent = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalizedContent) return '[no content]';
  const lines = normalizedContent.split('\n');
  const cleanedLines: string[] = [];
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine === '--') break;
    if (/^>\s*(?:>\s*)*$/.test(trimmedLine)) continue;
    cleanedLines.push(trimmedLine);
  }
  return cleanedLines.join('\n').trim();
}

export function toReplySubject(subject: string): string {
  const trimmed = subject.trim();
  if (!trimmed.toLowerCase().startsWith('re:')) {
    return `Re: ${trimmed}`;
  }
  return trimmed;
}
