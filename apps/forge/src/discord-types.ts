import { Collection, Message } from 'discord.js';

/**
 * Type definitions for Discord provider
 */

export type DiscordSendableChannel = {
  id: string;
  name?: string | null;
  sendTyping(): Promise<unknown>;
  send(input: string | { content?: string; files?: Array<{ attachment: Buffer; name: string }> }): Promise<Message>;
  messages: {
    fetch(messageId: string): Promise<Message>;
    fetch(options: { limit: number; before?: string }): Promise<Collection<string, Message>>;
  };
};

export type DiscordOutboundFile = {
  attachment: Buffer;
  name: string;
};

export type DiscordChannelConfig = {
  channelId: string;
  channelName?: string;
  respondToMentionsOnly: boolean;
};

export type DiscordProviderConfig = {
  token: string;
  channels?: DiscordChannelConfig[];
};
