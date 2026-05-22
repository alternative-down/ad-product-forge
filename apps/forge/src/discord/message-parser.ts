import type { Message } from 'discord.js';

import { forgeDebug } from '@forge-runtime/core';
import { serializeError } from '../agents/agent-runner-error-formatting';
import type { CommunicationFile } from '@forge-runtime/core';

export async function downloadDiscordAttachments(
  message: Message,
): Promise<CommunicationFile[]> {
  return await Promise.all(
    Array.from(message.attachments.values()).map(async (attachment) => {
      try {
        const response = await fetch(attachment.url);

        if (!response.ok) {
          const error = new Error(
            `Failed to download Discord attachment: ${attachment.url} (HTTP ${response.status})`,
          );
          forgeDebug({
            scope: 'discord-account',
            level: 'error',
            message: 'downloadAttachment: failed',
            context: { url: attachment.url, status: response.status, error: error.message },
          });
          throw error;
        }

        const arrayBuffer = await response.arrayBuffer();

        return {
          name: attachment.name ?? attachment.id,
          data: new Uint8Array(arrayBuffer),
          contentType: attachment.contentType ?? undefined,
          sizeBytes: attachment.size,
        };
      } catch (error) {
        forgeDebug({
          scope: 'discord-account',
          level: 'warn',
          message: 'Failed to download Discord attachment',
          context: {
            attachmentUrl: attachment.url,
            attachmentId: attachment.id,
            error: String(serializeError(error)),
          },
        });
        return {
          name: attachment.name ?? attachment.id,
          data: new Uint8Array(0),
          contentType: undefined,
          sizeBytes: 0,
        };
      }
    }),
  );
}

export function extractDiscordMessageContent(message: Message, botUserId?: string) {
  const textContent = (
    (botUserId ?? '') !== ''
      ? message.content.replaceAll(`<@${botUserId}>`, '').replaceAll(`<@!${botUserId}>`, '')
      : message.content
  ).trim();

  const embedContent = message.embeds
    .map((embed) =>
      [
        embed.title?.trim(),
        embed.description?.trim(),
        embed.fields
          .map((field) => `${field.name}: ${field.value}`.trim())
          .filter(Boolean)
          .join('\n'),
        embed.footer?.text?.trim(),
        embed.url?.trim(),
      ]
        .filter((value) => value !== undefined && value !== null && value.length > 0)
        .join('\n'),
    )
    .filter((value) => value.length > 0)
    .join('\n\n');

  return [textContent, embedContent].filter((value) => value.length > 0).join('\n\n');
}