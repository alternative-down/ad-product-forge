import { customAlphabet } from 'nanoid';
import path from 'node:path';

const createSlugSuffix = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 6);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InternalChatGroupMember {
  groupId: string;
  participantId: string;
  participantKey: string;
  participantSlug: string;
  participantName: string;
  role: string;
  createdAt: string;
}

export interface InternalChatGroupParticipant {
  accountId: string;
  agentId: string | null;
  slug: string;
  displayName: string;
}

export interface InternalChatGroupRow {
  id: string;
  name: string | null;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Slug & filename helpers
// ---------------------------------------------------------------------------

/**
 * Parses a date string into a Unix timestamp (ms), or null if undefined.
 * Throws if the value is provided but not a valid date string.
 */
export function parseFilterDate(value: string | undefined, fieldName: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    forgeDebug({ scope: "internal-chat-helpers", level: "warn", message: "parseFilterDate: invalid " + fieldName + ": " + value });
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }

  return parsed;
}

/**
 * Creates a slug suitable for internal chat group identifiers.
 * Takes the first word of the display name, lowercases and normalizes it,
 * then appends a random 6-character suffix for uniqueness.
 */
export function createInternalChatSlug(displayName: string): string {
  const baseSlug = displayName
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'agent';

  return `${baseSlug}-${createSlugSuffix()}`;
}

/**
 * Strips filesystem-reserved characters from a filename to make it safe for storage.
 */
export function sanitizeAttachmentName(fileName: string): string {
  const value = fileName
    .replace(/[/\\?%*:|"<>]/g, '-')
    .trim();

  return value || 'attachment';
}

/**
 * Resolves a MIME content type based on a filename's extension.
 * Returns undefined for unknown extensions.
 */
export function resolveContentType(fileName: string): string | undefined {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.pdf') return 'application/pdf';
  if (extension === '.json') return 'application/json';
  if (extension === '.txt' || extension === '.md') return 'text/plain';
  if (extension === '.csv') return 'text/csv';
  if (extension === '.mp3') return 'audio/mpeg';
  if (extension === '.wav') return 'audio/wav';
  if (extension === '.mp4') return 'video/mp4';

  return undefined;
}

/**
 * Builds a multi-line account description string for internal chat agent accounts.
 * Omits fields that are empty or undefined.
 */
export function buildAgentAccountDescription(input: {
  agentId: string;
  agentName: string;
  agentDescription?: string;
  roleName?: string;
  roleDescription?: string;
}): string {
  return [
    `Agent id: ${input.agentId}`,
    `Agent name: ${input.agentName}`,
    input.agentDescription?.trim() ? `Agent description: ${input.agentDescription.trim()}` : null,
    input.roleName?.trim() ? `Role name: ${input.roleName.trim()}` : null,
    input.roleDescription?.trim() ? `Role description: ${input.roleDescription.trim()}` : null,
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Conversation & participant transformation helpers
// ---------------------------------------------------------------------------

/**
 * Transforms an array of group members into simplified view objects
 * suitable for API responses (strips internal groupId and createdAt).
 */
export function buildGroupMemberViews(members: InternalChatGroupMember[]): Array<{
  participantId: string;
  participantKey: string;
  participantSlug: string;
  participantName: string;
  role: string;
}> {
  return members.map((member) => ({
    participantId: member.participantId,
    participantKey: member.participantKey,
    participantSlug: member.participantSlug,
    participantName: member.participantName,
    role: member.role,
  }));
}

/**
 * Transforms a raw DB group row into a group view object with ISO timestamps.
 */
export function buildGroupRow(row: InternalChatGroupRow): {
  groupId: string;
  name: string;
  provider: 'internal-chat';
  conversationKey: string;
  createdAt: string;
  updatedAt: string;
} {
  return {
    groupId: row.id,
    name: row.name ?? row.id,
    provider: 'internal-chat',
    conversationKey: row.id,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

/**
 * Sorts participants so the self-account appears first, followed by
 * the rest sorted alphabetically by displayName.
 */
export function sortParticipantsBySelfFirst<T extends InternalChatGroupParticipant>(
  participants: T[],
  selfAccountId: string,
): T[] {
  return [...participants].sort((left, right) => {
    if (left.accountId === selfAccountId) {
      return -1;
    }
    if (right.accountId === selfAccountId) {
      return 1;
    }
    return left.displayName.localeCompare(right.displayName);
  });
}

/**
 * Resolves the display name for a conversation.
 * Prefers the explicitly set name; falls back to the first non-self participant's
 * display name (for DMs), then the first participant's name.
 */
export function resolveConversationDisplayName(
  conversation: { name: string | null; type: string },
  participants: InternalChatGroupParticipant[],
  selfAccountId: string,
): string | undefined {
  return (
    conversation.name
    ?? participants.find((p) => p.accountId !== selfAccountId)?.displayName
    ?? participants[0]?.displayName
  );
}

/**
 * Extracts an ordered list of participant display names from a participant array.
 */
export function buildConversationParticipantNames(participants: InternalChatGroupParticipant[]): string[] {
  return participants.map((p) => p.displayName);
}

/**
 * Transforms an array of participants into the groupMembers metadata format
 * used in live message delivery and unread replay payloads.
 */
export function buildGroupMetadata(participants: InternalChatGroupParticipant[]): Array<{
  participantId: string;
  agentId: string | null;
  slug: string;
  displayName: string;
}> {
  return participants.map((p) => ({
    participantId: p.accountId,
    agentId: p.agentId,
    slug: p.slug,
    displayName: p.displayName,
  }));
}
