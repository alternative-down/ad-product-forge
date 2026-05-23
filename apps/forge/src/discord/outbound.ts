import type { Message } from 'discord.js';

import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../agents/agent-runner-error-formatting';
import type { CommunicationFile } from '@forge-runtime/core';
import type { DiscordSendableChannel, DiscordOutboundFile } from '../discord-types';

const MAX_MESSAGE_LENGTH = 2_000;
const CHUNK_BREAKPOINT = 1_500;

export function splitDiscordMessageContent(content: string) {
  const chunks: string[] = [];
  const normalizedContent = content.trim();

  if (!normalizedContent) {
    return [''];
  }

  for (const paragraph of normalizedContent.split('\n\n')) {
    if (paragraph.length <= MAX_MESSAGE_LENGTH) {
      const nextChunk = chunks[chunks.length - 1];

      if (!nextChunk) {
        chunks.push(paragraph);
        continue;
      }

      const separator = nextChunk.length === 0 ? '' : '\n\n';
      if (nextChunk.length + separator.length + paragraph.length <= MAX_MESSAGE_LENGTH) {
        chunks[chunks.length - 1] = `${nextChunk}${separator}${paragraph}`;
        continue;
      }

      chunks.push(paragraph);
      continue;
    }

    let remainingParagraph = paragraph;

    while (remainingParagraph.length > MAX_MESSAGE_LENGTH) {
      const slice = remainingParagraph.slice(0, MAX_MESSAGE_LENGTH);
      const breakIndex = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
      const chunkEnd = breakIndex >= CHUNK_BREAKPOINT ? breakIndex : MAX_MESSAGE_LENGTH;
      chunks.push(remainingParagraph.slice(0, chunkEnd).trim());
      remainingParagraph = remainingParagraph.slice(chunkEnd).trim();
    }

    if (remainingParagraph.length > 0) {
      chunks.push(remainingParagraph);
    }
  }

  return chunks;
}

export function toDiscordOutboundFiles(attachments: CommunicationFile[]): DiscordOutboundFile[] {
  return attachments.map((attachment) => ({
    attachment: Buffer.from(attachment.data),
    name: attachment.name,
  }));
}

export async function sendDiscordChunks(input: {
  channel: DiscordSendableChannel;
  content: string;
  attachments: CommunicationFile[];
  rememberOutboundMessage: (conversationKey: string, content: string) => void;
}) {
  const messageChunks = splitDiscordMessageContent(input.content);
  let lastSentMessage: Message | null = null;
  const outboundFiles = toDiscordOutboundFiles(input.attachments);

  try {
    for (const [index, chunk] of messageChunks.entries()) {
      if (index === 0) {
        lastSentMessage = await input.channel.send({
          content: chunk,
          ...(outboundFiles.length > 0 ? { files: outboundFiles } : {}),
        });
      } else {
        lastSentMessage = await input.channel.send(chunk);
      }

      input.rememberOutboundMessage(lastSentMessage.channelId, chunk);
    }
  } catch (error) {
    forgeDebug({
      scope: 'discord-account',
      level: 'error',
      message: 'sendDiscordChunks failed',
      context: { channelId: input.channel.id, error: errorMsg(error) },
    });
    throw error;
  }

  if (!lastSentMessage) {
    throw new Error('Discord message content produced no chunks to send');
  }

  return lastSentMessage;
}