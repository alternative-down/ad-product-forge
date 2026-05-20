export type DiscordProviderCredentials = {
  token: string;

  channels: Array<{
    channelId: string;

    channelName?: string;

    respondToMentionsOnly: boolean;
  }>;
};

export type EmailProviderCredentials = {
  imap: {
    host: string;

    port: number;

    secure: boolean;

    user: string;

    password: string;
  };

  smtp: {
    host: string;

    port: number;

    secure: boolean;

    user: string;

    password: string;
  };
};
