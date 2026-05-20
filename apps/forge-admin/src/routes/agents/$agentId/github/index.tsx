import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';

import { AdminButton, AdminLoadingState, PageHeader } from '@/components/admin';
import { getAgent, updateAgentGitHubManifestConfig } from '@/lib/admin-api/index';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';

export const Route = createFileRoute('/agents/$agentId/github/')({
  component: AgentGithubIndexRoute,
});

function AgentGithubIndexRoute() {
  const { agentId } = Route.useParams();
  const queryClient = useQueryClient();
  const agentQuery = useQuery({
    queryKey: ['admin', 'agent', agentId],
    queryFn: () => getAgent(agentId),
  });
  const provisioning = agentQuery.data?.githubProvisioning ?? null;
  const registrationUrl = provisioning?.registrationUrl ?? null;
  const installUrl = provisioning?.installUrl ?? null;
  const updateManifestMutation = useMutation({
    mutationFn: (manifestConfig: NonNullable<typeof provisioning>['manifestConfig']) =>
      updateAgentGitHubManifestConfig({ agentId, manifestConfig }),
    onMutate: () => startAdminAction('Salvando configuração do GitHub App...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Configuração do GitHub App atualizada.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
    },
    onError: (error, _variables, context) => failAdminAction(context, error),
  });

  return (
    <div className="min-w-0 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader
        title="Github App"
        description="Defina o manifest do app antes de criar o GitHub App. Depois que o app já existir, mudanças aqui só valem se ele for recriado."
        actions={
          <>
            {registrationUrl ? (
              <AdminButton asChild>
                <a href={registrationUrl} target="_blank" rel="noreferrer">
                  Criar app
                </a>
              </AdminButton>
            ) : (
              <AdminButton disabled>Criar app</AdminButton>
            )}
            {installUrl ? (
              <AdminButton asChild variant="outline">
                <a href={installUrl} target="_blank" rel="noreferrer">
                  Instalar app
                </a>
              </AdminButton>
            ) : (
              <AdminButton variant="outline" disabled>
                Instalar app
              </AdminButton>
            )}
          </>
        }
      />

      {agentQuery.isLoading && !agentQuery.data ? (
        <AdminLoadingState label="Carregando Github App..." />
      ) : null}

      <section className="space-y-4">
        <ReadOnlyItem
          label="Status"
          value={provisioning ? humanizeGithubStatus(provisioning.status) : '—'}
        />
        <ReadOnlyItem label="Link de criação" value={registrationUrl ?? '—'} />
        <ReadOnlyItem label="Link de instalação" value={installUrl ?? '—'} />
      </section>

      {provisioning ? (
        <section className="grid gap-6 lg:grid-cols-2">
          <ManifestFieldset
            title="Permissões"
            description="Essas permissões entram no manifest enviado para o GitHub no momento da criação do app."
            items={Object.entries(provisioning.manifestConfig.permissions).map(
              ([key, enabled]) => ({
                key,
                enabled,
                label: humanizeManifestKey(key),
                locked: key === 'metadata',
              }),
            )}
            disabled={updateManifestMutation.isPending}
            onToggle={(key, enabled) => {
              const nextManifestConfig = {
                ...provisioning.manifestConfig,
                permissions: {
                  ...provisioning.manifestConfig.permissions,
                  [key]: enabled,
                },
              };

              updateManifestMutation.mutate(nextManifestConfig);
            }}
          />

          <ManifestFieldset
            title="Eventos"
            description="Desative aqui os eventos webhook que o app vai assinar. Isso não remove o acesso às tools do GitHub."
            items={Object.entries(provisioning.manifestConfig.events).map(([key, enabled]) => ({
              key,
              enabled,
              label: humanizeManifestKey(key),
            }))}
            disabled={updateManifestMutation.isPending}
            onToggle={(key, enabled) => {
              const nextManifestConfig = {
                ...provisioning.manifestConfig,
                events: {
                  ...provisioning.manifestConfig.events,
                  [key]: enabled,
                },
              };

              updateManifestMutation.mutate(nextManifestConfig);
            }}
          />
        </section>
      ) : null}

      {agentQuery.error ? (
        <div className="text-sm text-destructive">{agentQuery.error.message}</div>
      ) : null}
    </div>
  );
}

function ManifestFieldset(input: {
  title: string;
  description: string;
  items: Array<{
    key: string;
    label: string;
    enabled: boolean;
    locked?: boolean;
  }>;
  disabled: boolean;
  onToggle: (key: string, enabled: boolean) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <div className="text-sm font-medium">{input.title}</div>
        <div className="text-sm text-muted-foreground">{input.description}</div>
      </div>

      <div className="space-y-2">
        {input.items.map((item) => (
          <label
            key={item.key}
            className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5 text-sm"
          >
            <span>{item.label}</span>
            <input
              type="checkbox"
              checked={item.enabled}
              disabled={input.disabled || item.locked}
              onChange={(event) => input.onToggle(item.key, event.currentTarget.checked)}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function ReadOnlyItem(input: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-sm text-muted-foreground">{input.label}</div>
      <div className="break-all text-sm leading-6 text-foreground">{input.value}</div>
    </div>
  );
}

function humanizeGithubStatus(status: 'pending' | 'created' | 'active') {
  if (status === 'pending') {
    return 'Pendente';
  }

  if (status === 'created') {
    return 'Criado';
  }

  return 'Ativo';
}

function humanizeManifestKey(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}
