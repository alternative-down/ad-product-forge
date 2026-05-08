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

export interface ChatAttachmentsDeps {
  readMessageAttachments(messageId: string): Promise<CommunicationFile[]>;
}

export function createChatAttachments(
  db: Database,
  _deps?: ChatAttachmentsDeps,
) {
  async function storeMessageAttachments(messageId: string, attachments: CommunicationFile[]) {
    if (attachments.length === 0) {
      return;
    }

    try {
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
        })),
      );
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-attachments',
        level: 'error',
        message: `storeMessageAttachments failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { messageId, attachmentCount: attachments.length },
      });
      forgeDebug({ scope: 'internal-chat-attachments', level: 'error', message: 'internal-chat-attachments operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  async function readMessageAttachments(messageId: string): Promise<CommunicationFile[]> {
    try {
      const rows = await db.query.internalChatMessageAttachments.findMany({
        where: eq(internalChatMessageAttachments.messageId, messageId),
        orderBy: (table, { asc }) => [asc(table.attachmentIndex)],
      });

      return rows.map((row) => ({
        name: row.name,
        data: new Uint8Array(row.data),
        contentType: row.contentType ?? resolveContentType(row.name),
        sizeBytes: row.sizeBytes,
      }));
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-attachments',
        level: 'error',
        message: `readMessageAttachments failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { messageId },
      });
      forgeDebug({ scope: 'internal-chat-attachments', level: 'error', message: 'internal-chat-attachments operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  async function readMessageAttachment(
    messageId: string,
    attachmentName: string,
  ): Promise<CommunicationFile | null> {
    try {
      const attachments = await readMessageAttachments(messageId);
      return attachments.find((attachment) => attachment.name === attachmentName) ?? null;
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-attachments',
        level: 'error',
        message: `readMessageAttachment failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { messageId, attachmentName },
      });
      forgeDebug({ scope: 'internal-chat-attachments', level: 'error', message: 'internal-chat-attachments operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  return {
    storeMessageAttachments,
    readMessageAttachments,
    readMessageAttachment,
  };
}