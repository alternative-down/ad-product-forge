import type { ExternalProvider } from './agent-account';

export type ExternalActor = {
  externalUserId: string;
  displayName?: string;
  username?: string;
};

export type ExternalAttachment = {
  id?: string;
  name?: string;
  url: string;
  contentType?: string;
  sizeBytes?: number;
  description?: string;
};

export type ExternalEvent = {
  eventId: string;
  provider: ExternalProvider;
  accountId?: string;
  externalAccountId?: string;
  channelId?: string;
  channelName?: string;
  conversationId?: string;
  sender: ExternalActor;
  content: string;
  attachments?: ExternalAttachment[];
  receivedAt: Date;
  metadata?: Record<string, unknown>;
};
