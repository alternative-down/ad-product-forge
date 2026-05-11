import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Switch } from '@/components/ui/switch';
import { getSystemIntegrations, upsertSystemIntegration } from '@/lib/admin-api/index';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';

export const Route = createFileRoute('/settings/github/')({
  component: SettingsGithubRoute,
});

function SettingsGithubRoute() {
  const queryClient = useQueryClient();
  const integrationsQuery = useQuery({
    queryKey: ['admin', 'system-integrations'],
    queryFn: getSystemIntegrations,
  });
  const integration = useMemo(
    () => integrationsQuery.data?.find((item) => item.providerType === 'github') ?? null,
    [integrationsQuery.data],
  );
  const [draft, setDraft] = useState<{
    organization: string;
    appHomeUrl: string;
    isEnabled: boolean;
  } | null>(null);
  const mutation = useMutation({
    mutationFn: upsertSystemIntegration,
    onMutate: () => startAdminAction('Salvando Github...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Github atualizado.');
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-integrations'] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const organization = draft?.organization ?? (integration?.config?.organization ?? '');
  const appHomeUrl = draft?.appHomeUrl ?? (integration?.config?.appHomeUrl ?? '');
  const isEnabled = draft?.isEnabled ?? (integration?.isEnabled ?? false);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {integrationsQuery.isLoading && !integrationsQuery.data ? <AdminLoadingState label="Carregando Github..." /> : null}
      <PageHeader
        title="Github"
        description="Conecta o sistema ao GitHub para provisionar apps e operar os repositórios dos agentes."
      />

      <div className="max-w-3xl space-y-5">
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({
              providerType: 'github',
              isEnabled,
              config: {
                organization: organization.trim(),
                appHomeUrl: appHomeUrl.trim(),
              },
            });
          }}
        >
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="github-organization">
              Organização
            </label>
            <AdminInput
              id="github-organization"
              value={organization}
              onChange={(event) =>
                setDraft((current) => ({
                  organization: event.target.value,
                  appHomeUrl: current?.appHomeUrl ?? integration?.config?.appHomeUrl ?? '',
                  isEnabled: current?.isEnabled ?? integration?.isEnabled ?? true,
                }))
              }
              disabled={mutation.isPending}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="github-app-home-url">
              App home URL
            </label>
            <AdminInput
              id="github-app-home-url"
              value={appHomeUrl}
              onChange={(event) =>
                setDraft((current) => ({
                  organization: current?.organization ?? integration?.config?.organization ?? '',
                  appHomeUrl: event.target.value,
                  isEnabled: current?.isEnabled ?? integration?.isEnabled ?? true,
                }))
              }
              disabled={mutation.isPending}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="github-status">
              Ativo
            </label>
            <div className="flex min-h-9 items-center">
              <Switch
                id="github-status"
                checked={isEnabled}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({
                    organization: current?.organization ?? integration?.config?.organization ?? '',
                    appHomeUrl: current?.appHomeUrl ?? integration?.config?.appHomeUrl ?? '',
                    isEnabled: checked,
                  }))
                }
                disabled={mutation.isPending}
              />
            </div>
          </div>
          {integrationsQuery.error ? <div className="text-sm text-destructive">{integrationsQuery.error.message}</div> : null}
          {mutation.error ? <div className="text-sm text-destructive">{mutation.error.message}</div> : null}
          <div className="flex justify-end">
            <AdminButton type="submit" disabled={mutation.isPending || !organization.trim() || !appHomeUrl.trim()}>
              {mutation.isPending ? 'Salvando...' : 'Salvar'}
            </AdminButton>
          </div>
        </form>
      </div>
    </div>
  );
}
