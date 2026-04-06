import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';

import { AdminButton, AdminInput, PageHeader } from '@/components/admin';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  deleteAgentProvider,
  upsertAgentProvider,
  type DiscordProviderCredentials,
} from '@/lib/admin-api';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';

import { toDiscordCredentials } from './-provider-credentials';

export function DiscordProviderForm(input: {
  agentId: string;
  credentials: unknown;
  configured: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DiscordProviderCredentials | null>(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelId, setNewChannelId] = useState('');
  const [newChannelMentionsOnly, setNewChannelMentionsOnly] = useState(false);
  const saveMutation = useMutation({
    mutationFn: upsertAgentProvider,
    onMutate: () => startAdminAction('Salvando Discord...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Discord atualizado.');
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', input.agentId] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteAgentProvider(input.agentId, 'discord'),
    onMutate: () => startAdminAction('Removendo Discord...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Discord removido.');
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', input.agentId] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
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
              <div className="space-y-3 pb-3">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="discord-channel-name">
                      Nome do canal
                    </label>
                    <AdminInput
                      id="discord-channel-name"
                      value={newChannelName}
                      onChange={(event) => setNewChannelName(event.target.value)}
                      disabled={pending}
                    />
                  </div>

                  <div className="space-y-2">
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
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="discord-new-channel-mentions-only">
                      Responder só a menções
                    </label>
                    <div className="flex min-h-9 items-center">
                      <Switch
                        id="discord-new-channel-mentions-only"
                        checked={newChannelMentionsOnly}
                        onCheckedChange={setNewChannelMentionsOnly}
                        disabled={pending}
                      />
                    </div>
                  </div>

                  <AdminButton
                    type="button"
                    disabled={pending || !newChannelId.trim()}
                    onClick={() => {
                      const channelId = newChannelId.trim();
                      const channelName = newChannelName.trim();

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
                              channelName,
                              respondToMentionsOnly: newChannelMentionsOnly,
                            },
                          ],
                        };
                      });
                      setNewChannelName('');
                      setNewChannelId('');
                      setNewChannelMentionsOnly(false);
                    }}
                  >
                    Incluir
                  </AdminButton>
                </div>
              </div>

              <Separator />

              {credentials.channels.length > 0 ? (
                <div className="space-y-3">
                  {credentials.channels.map((channel, index) => (
                    <div key={`${channel.channelId}-${index}`} className="space-y-3">
                      <div className="space-y-3">
                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
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

                        <div className="flex items-center justify-between gap-3">
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

                          <div className="pt-6">
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
                      </div>

                      {index < credentials.channels.length - 1 ? <Separator /> : null}
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
