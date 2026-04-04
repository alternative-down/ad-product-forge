import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { AdminButton, AdminInput, AdminTextarea, PageHeader } from '@/components/admin';
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
                allowedChannelIds: normalizeLineList(credentials.allowedChannelIds.join('\n')),
                respondToMentionsOnly: credentials.respondToMentionsOnly,
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
            <label className="text-sm font-medium" htmlFor="discord-channel-ids">
              Canais permitidos
            </label>
            <AdminTextarea
              id="discord-channel-ids"
              rows={6}
              value={credentials.allowedChannelIds.join('\n')}
              onChange={(event) =>
                setDraft((current) => ({
                  ...(current ?? toDiscordCredentials(input.credentials)),
                  allowedChannelIds: normalizeLineList(event.target.value),
                }))
              }
              disabled={pending}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="discord-mentions-only">
              Responder só a menções
            </label>
            <div className="flex min-h-9 items-center">
              <Switch
                id="discord-mentions-only"
                checked={credentials.respondToMentionsOnly}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({
                    ...(current ?? toDiscordCredentials(input.credentials)),
                    respondToMentionsOnly: checked,
                  }))
                }
                disabled={pending}
              />
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

function normalizeLineList(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toDiscordCredentials(credentials: unknown): DiscordProviderCredentials {
  if (!isRecord(credentials)) {
    return {
      token: '',
      allowedChannelIds: [],
      respondToMentionsOnly: false,
    };
  }

  return {
    token: typeof credentials.token === 'string' ? credentials.token : '',
    allowedChannelIds: Array.isArray(credentials.allowedChannelIds)
      ? credentials.allowedChannelIds.filter((value): value is string => typeof value === 'string')
      : [],
    respondToMentionsOnly: credentials.respondToMentionsOnly === true,
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
