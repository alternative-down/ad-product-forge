import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { AdminButton, AdminInput, PageHeader } from '@/components/admin';
import {
  deleteAgentProvider,
  getAgent,
  upsertAgentProvider,
  type DiscordProviderCredentials,
  type EmailProviderCredentials,
} from '@/lib/admin-api';
import { Switch } from '@/components/ui/switch';

export const Route = createFileRoute('/agents/$agentId/providers/$providerType/')({
  component: AgentProviderIndexRoute,
});

function AgentProviderIndexRoute() {
  const { agentId, providerType } = Route.useParams();
  const agentQuery = useQuery({
    queryKey: ['admin', 'agent', agentId],
    queryFn: () => getAgent(agentId),
  });
  const provider = useMemo(
    () => agentQuery.data?.providers.find((item) => item.providerType === providerType) ?? null,
    [agentQuery.data?.providers, providerType],
  );

  if (providerType === 'internal-chat') {
    return <div className="text-sm text-muted-foreground">Provider não disponível nesta área.</div>;
  }

  if (providerType === 'discord') {
    return <DiscordProviderForm agentId={agentId} credentials={provider?.credentials} configured={Boolean(provider)} />;
  }

  if (providerType === 'email') {
    return <EmailProviderForm agentId={agentId} credentials={provider?.credentials} configured={Boolean(provider)} />;
  }

  return <div className="text-sm text-muted-foreground">Provider não suportado nesta área.</div>;
}

function DiscordProviderForm(input: {
  agentId: string;
  credentials: unknown;
  configured: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DiscordProviderCredentials | null>(null);
  const [newChannelId, setNewChannelId] = useState('');
  const saveMutation = useMutation({
    mutationFn: upsertAgentProvider,
    onSuccess: async () => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', input.agentId] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteAgentProvider(input.agentId, 'discord'),
    onSuccess: async () => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', input.agentId] });
    },
  });
  const credentials = draft ?? toDiscordCredentials(input.credentials);
  const pending = saveMutation.isPending || deleteMutation.isPending;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader
        title="Discord"
        description="Configura o agente para ler e responder canais e mensagens do Discord."
      />

      <div className="max-w-3xl space-y-5">
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate({
              agentId: input.agentId,
              providerType: 'discord',
              credentials: {
                token: credentials.token.trim(),
                channels: credentials.channels,
              },
            });
          }}
        >
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="discord-token">
              Token
            </label>
            <AdminInput
              id="discord-token"
              type="password"
              value={credentials.token}
              onChange={(event) =>
                setDraft((current) => ({
                  ...(current ?? toDiscordCredentials(input.credentials)),
                  token: event.target.value,
                }))
              }
              disabled={pending}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="discord-channel-id">
              Canais
            </label>
            <div className="space-y-3">
              <div className="flex items-end gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <label className="text-sm font-medium" htmlFor="discord-channel-id">
                    Código do canal
                  </label>
                  <AdminInput
                    id="discord-channel-id"
                    value={newChannelId}
                    onChange={(event) => setNewChannelId(event.target.value)}
                    disabled={pending}
                  />
                </div>
                <AdminButton
                  type="button"
                  disabled={pending || !newChannelId.trim()}
                  onClick={() => {
                    const channelId = newChannelId.trim();

                    if (!channelId) {
                      return;
                    }

                    setDraft((current) => {
                      const next = current ?? toDiscordCredentials(input.credentials);

                      if (next.channels.some((value) => value.channelId === channelId)) {
                        return next;
                      }

                      return {
                        ...next,
                        channels: [
                          ...next.channels,
                          {
                            channelId,
                            channelName: '',
                            respondToMentionsOnly: false,
                          },
                        ],
                      };
                    });
                    setNewChannelId('');
                  }}
                >
                  Adicionar
                </AdminButton>
              </div>

              {credentials.channels.length > 0 ? (
                <div className="space-y-2">
                  {credentials.channels.map((channel, index) => (
                    <div key={`${channel.channelId}-${index}`} className="space-y-3 border-b border-border pb-3">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="grid gap-3 min-[560px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                            <div className="space-y-2">
                              <label className="text-sm font-medium" htmlFor={`discord-channel-name-${index}`}>
                                Nome do canal
                              </label>
                              <AdminInput
                                id={`discord-channel-name-${index}`}
                                value={channel.channelName ?? ''}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...(current ?? toDiscordCredentials(input.credentials)),
                                    channels: (current ?? toDiscordCredentials(input.credentials)).channels.map((value, valueIndex) =>
                                      valueIndex === index
                                        ? { ...value, channelName: event.target.value }
                                        : value,
                                    ),
                                  }))
                                }
                                disabled={pending}
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="text-sm font-medium" htmlFor={`discord-channel-id-${index}`}>
                                Código do canal
                              </label>
                              <AdminInput
                                id={`discord-channel-id-${index}`}
                                value={channel.channelId}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...(current ?? toDiscordCredentials(input.credentials)),
                                    channels: (current ?? toDiscordCredentials(input.credentials)).channels.map((value, valueIndex) =>
                                      valueIndex === index
                                        ? { ...value, channelId: event.target.value }
                                        : value,
                                    ),
                                  }))
                                }
                                disabled={pending}
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium" htmlFor={`discord-mentions-only-${index}`}>
                              Responder só a menções
                            </label>
                            <div className="flex min-h-9 items-center">
                              <Switch
                                id={`discord-mentions-only-${index}`}
                                checked={channel.respondToMentionsOnly}
                                onCheckedChange={(checked) =>
                                  setDraft((current) => ({
                                    ...(current ?? toDiscordCredentials(input.credentials)),
                                    channels: (current ?? toDiscordCredentials(input.credentials)).channels.map((value, valueIndex) =>
                                      valueIndex === index
                                        ? { ...value, respondToMentionsOnly: checked }
                                        : value,
                                    ),
                                  }))
                                }
                                disabled={pending}
                              />
                            </div>
                          </div>
                        </div>

                        <AdminButton
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          disabled={pending}
                          onClick={() =>
                            setDraft((current) => ({
                              ...(current ?? toDiscordCredentials(input.credentials)),
                              channels: (current ?? toDiscordCredentials(input.credentials)).channels.filter(
                                (_, valueIndex) => valueIndex !== index,
                              ),
                            }))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Remover</span>
                        </AdminButton>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Nenhum canal configurado.</div>
              )}
            </div>
          </div>

          {saveMutation.error ? <div className="text-sm text-destructive">{saveMutation.error.message}</div> : null}
          {deleteMutation.error ? <div className="text-sm text-destructive">{deleteMutation.error.message}</div> : null}

          <div className="flex justify-end gap-3">
            {input.configured ? (
              <AdminButton
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => deleteMutation.mutate()}
              >
                {deleteMutation.isPending ? 'Removendo...' : 'Remover'}
              </AdminButton>
            ) : null}
            <AdminButton type="submit" disabled={pending || !credentials.token.trim()}>
              {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
            </AdminButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmailProviderForm(input: {
  agentId: string;
  credentials: unknown;
  configured: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<EmailProviderCredentials | null>(null);
  const saveMutation = useMutation({
    mutationFn: upsertAgentProvider,
    onSuccess: async () => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', input.agentId] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteAgentProvider(input.agentId, 'email'),
    onSuccess: async () => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', input.agentId] });
    },
  });
  const credentials = draft ?? toEmailCredentials(input.credentials);
  const pending = saveMutation.isPending || deleteMutation.isPending;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader
        title="Email"
        description="Configura o agente para ler e enviar e-mails pela caixa conectada."
      />

      <div className="max-w-3xl space-y-5">
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate({
              agentId: input.agentId,
              providerType: 'email',
              credentials,
            });
          }}
        >
          <ProviderSectionTitle title="IMAP" />
          <EmailConnectionFields
            prefix="imap"
            value={credentials.imap}
            disabled={pending}
            onChange={(nextValue) =>
              setDraft((current) => ({
                ...(current ?? toEmailCredentials(input.credentials)),
                imap: nextValue,
              }))
            }
          />

          <ProviderSectionTitle title="SMTP" />
          <EmailConnectionFields
            prefix="smtp"
            value={credentials.smtp}
            disabled={pending}
            onChange={(nextValue) =>
              setDraft((current) => ({
                ...(current ?? toEmailCredentials(input.credentials)),
                smtp: nextValue,
              }))
            }
          />

          {saveMutation.error ? <div className="text-sm text-destructive">{saveMutation.error.message}</div> : null}
          {deleteMutation.error ? <div className="text-sm text-destructive">{deleteMutation.error.message}</div> : null}

          <div className="flex justify-end gap-3">
            {input.configured ? (
              <AdminButton
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => deleteMutation.mutate()}
              >
                {deleteMutation.isPending ? 'Removendo...' : 'Remover'}
              </AdminButton>
            ) : null}
            <AdminButton type="submit" disabled={pending || !isEmailCredentialsValid(credentials)}>
              {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
            </AdminButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmailConnectionFields(input: {
  prefix: string;
  value: EmailProviderCredentials['imap'];
  disabled: boolean;
  onChange(value: EmailProviderCredentials['imap']): void;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${input.prefix}-host`}>
          Host
        </label>
        <AdminInput
          id={`${input.prefix}-host`}
          value={input.value.host}
          onChange={(event) => input.onChange({ ...input.value, host: event.target.value })}
          disabled={input.disabled}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${input.prefix}-port`}>
          Porta
        </label>
        <AdminInput
          id={`${input.prefix}-port`}
          type="number"
          value={String(input.value.port)}
          onChange={(event) => input.onChange({ ...input.value, port: Number(event.target.value || 0) })}
          disabled={input.disabled}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${input.prefix}-user`}>
          Usuário
        </label>
        <AdminInput
          id={`${input.prefix}-user`}
          value={input.value.user}
          onChange={(event) => input.onChange({ ...input.value, user: event.target.value })}
          disabled={input.disabled}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${input.prefix}-password`}>
          Senha
        </label>
        <AdminInput
          id={`${input.prefix}-password`}
          type="password"
          value={input.value.password}
          onChange={(event) => input.onChange({ ...input.value, password: event.target.value })}
          disabled={input.disabled}
        />
      </div>

      <div className="space-y-2 md:col-span-2">
        <label className="text-sm font-medium" htmlFor={`${input.prefix}-secure`}>
          Seguro
        </label>
        <div className="flex min-h-9 items-center">
          <Switch
            id={`${input.prefix}-secure`}
            checked={input.value.secure}
            onCheckedChange={(checked) => input.onChange({ ...input.value, secure: checked })}
            disabled={input.disabled}
          />
        </div>
      </div>
    </div>
  );
}

function ProviderSectionTitle(input: {
  title: string;
}) {
  return <div className="text-sm font-medium text-foreground">{input.title}</div>;
}

function toDiscordCredentials(credentials: unknown): DiscordProviderCredentials {
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
              ? [{
                  channelId: value,
                  channelName: '',
                  respondToMentionsOnly: credentials.respondToMentionsOnly === true,
                }]
              : [],
          )
      : [],
  };
}

function toEmailCredentials(credentials: unknown): EmailProviderCredentials {
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

function isEmailCredentialsValid(credentials: EmailProviderCredentials) {
  return [
    credentials.imap.host,
    credentials.imap.user,
    credentials.imap.password,
    credentials.smtp.host,
    credentials.smtp.user,
    credentials.smtp.password,
  ].every((value) => value.trim().length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
