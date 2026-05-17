/**
 * Internal Chat — Attachments Module
 *
 * Stores and retrieves file attachments for chat messages.
 * Extracted from #1283 / #1215 refactor of internal-chat-service.ts.
 *
 * @module
 */
import { eq } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';

import type { CommunicationFile } from '@forge-runtime/core';


import type {Database} from '../database/schema';
import { internalChatMessageAttachments } from '../database/schema';
import { createId } from '../utils/id';
import { resolveContentType, sanitizeAttachmentName } from './internal-chat-helpers';

export function createChatAttachments(
  db: Database,
) {
  async function storeMessageAttachments(messageId: string, attachments: CommunicationFile[]) {
    if (attachments.length === 0) {
      return;
    }

      await db.insert(internalChatMessageAttachments).values(
        attachments.map((attachment, index) => ({
          id: createId(),
          messageId,
          attachmentIndex: index,
          name: sanitizeAttachmentName(attachment.name),
          contentType: attachment.contentType ?? null,
          sizeBytes: attachment.sizeBytes ?? attachment.data.byteLength,
          data: Buffer.from(attachment.data),
          createdAt: Date.now(),
        })) as any);
  }

  async function readMessageAttachments(messageId: string): Promise<CommunicationFile[]> {
      const rows = await db.query.internalChatMessageAttachments.findMany({
        where: eq(internalChatMessageAttachments.messageId, messageId),
  
        orderBy: (table, { asc }) => [asc(table.attachmentIndex)],
      });

      return rows.map((row: any) => ({
        name: row.name,
        data: new Uint8Array(row.data),
        contentType: row.contentType ?? resolveContentType(row.name),
        sizeBytes: row.sizeBytes,
      }));
  }

  async function readMessageAttachment(
    messageId: string,
    attachmentName: string,
  ): Promise<CommunicationFile | null> {
    const attachments = await readMessageAttachments(messageId);
    return attachments.find((attachment) => attachment.name === attachmentName) ?? null;
  }

  return {
    storeMessageAttachments,
    readMessageAttachments,
    readMessageAttachment,
  };
}