export type UpsertAgentProviderInput =
  | {
      agentId: string;

      providerType: 'discord';

      credentials: DiscordProviderCredentials;
    }
  | {
      agentId: string;

      providerType: 'email';

      credentials: EmailProviderCredentials;
    };
