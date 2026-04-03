import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { AdminButton, AdminInput, PageHeader } from '@/components/admin';
import { Switch } from '@/components/ui/switch';
import { getSystemIntegrations, upsertSystemIntegration } from '@/lib/admin-api';

export const Route = createFileRoute('/integrations/github/')({
  component: IntegrationsGithubRoute,
});

function IntegrationsGithubRoute() {
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
    onSuccess: async () => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-integrations'] });
    },
  });
  const organization = draft?.organization ?? (integration?.config?.organization ?? '');
  const appHomeUrl = draft?.appHomeUrl ?? (integration?.config?.appHomeUrl ?? '');
  const isEnabled = draft?.isEnabled ?? (integration?.isEnabled ?? true);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader title="Github" />

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
              Status
            </label>
            <div className="flex min-h-9 items-center justify-between rounded-lg border border-border bg-background px-3">
              <span className="text-sm text-muted-foreground">{isEnabled ? 'Ativa' : 'Inativa'}</span>
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
