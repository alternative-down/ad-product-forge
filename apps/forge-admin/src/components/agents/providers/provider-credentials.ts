import type { DiscordProviderCredentials, EmailProviderCredentials } from '@/lib/admin-api/index';

export function toDiscordCredentials(credentials: unknown): DiscordProviderCredentials {
  if (!isRecord(credentials)) {
    return {
      token: '',
      channels: [],
    };
  }

  return {
    token: typeof credentials.token === 'string' ? credentials.token : '',
    channels: Array.isArray(credentials.channels)
      ? credentials.channels.flatMap((value) => {
          if (!isRecord(value) || typeof value.channelId !== 'string') {
            return [];
          }

          return [
            {
              channelId: value.channelId,
              channelName: typeof value.channelName === 'string' ? value.channelName : '',
              respondToMentionsOnly: value.respondToMentionsOnly === true,
            },
          ];
        })
      : Array.isArray(credentials.allowedChannelIds)
        ? credentials.allowedChannelIds.flatMap((value) =>
            typeof value === 'string'
              ? [
                  {
                    channelId: value,
                    channelName: '',
                    respondToMentionsOnly: credentials.respondToMentionsOnly === true,
                  },
                ]
              : [],
          )
        : [],
  };
}

export function toEmailCredentials(credentials: unknown): EmailProviderCredentials {
  const defaultConnection = {
    host: '',
    port: 0,
    secure: true,
    user: '',
    password: '',
  };

  if (!isRecord(credentials)) {
    return {
      imap: { ...defaultConnection, port: 993 },
      smtp: { ...defaultConnection, port: 465 },
    };
  }

  return {
    imap: toEmailConnection(credentials.imap, 993),
    smtp: toEmailConnection(credentials.smtp, 465),
  };
}

export function isEmailCredentialsValid(credentials: EmailProviderCredentials) {
  return [
    credentials.imap.host,
    credentials.imap.user,
    credentials.imap.password,
    credentials.smtp.host,
    credentials.smtp.user,
    credentials.smtp.password,
  ].every((value) => value.trim().length > 0);
}

function toEmailConnection(value: unknown, defaultPort: number) {
  if (!isRecord(value)) {
    return {
      host: '',
      port: defaultPort,
      secure: true,
      user: '',
      password: '',
    };
  }

  return {
    host: typeof value.host === 'string' ? value.host : '',
    port: typeof value.port === 'number' ? value.port : defaultPort,
    secure: value.secure !== false,
    user: typeof value.user === 'string' ? value.user : '',
    password: typeof value.password === 'string' ? value.password : '',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
