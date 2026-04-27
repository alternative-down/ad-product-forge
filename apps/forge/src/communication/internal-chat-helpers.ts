import { customAlphabet } from 'nanoid';
import path from 'node:path';

const createSlugSuffix = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 6);

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
