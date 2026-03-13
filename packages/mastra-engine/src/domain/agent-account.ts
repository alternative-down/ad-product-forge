export type ExternalProvider = 'discord' | 'email' | 'webhook' | (string & {});
export type AgentAccountStatus = 'active' | 'disabled';

export type AgentAccount = {
  accountId: string;
  agentId: string;
  provider: ExternalProvider;
  externalAccountId: string;
  status: AgentAccountStatus;
  routing?: {
    channelIds?: string[];
    guildIds?: string[];
    replyMode?: 'reply' | 'send';
  };
  credentialsRef?: string;
  metadata?: Record<string, unknown>;
};
