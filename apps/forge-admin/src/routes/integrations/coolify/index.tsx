import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { AdminButton, AdminInput, PageHeader } from '@/components/admin';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getSystemIntegrations, upsertSystemIntegration } from '@/lib/admin-api';

export const Route = createFileRoute('/integrations/coolify/')({
  component: IntegrationsCoolifyRoute,
});

function IntegrationsCoolifyRoute() {
  const queryClient = useQueryClient();
  const integrationsQuery = useQuery({
    queryKey: ['admin', 'system-integrations'],
    queryFn: getSystemIntegrations,
  });
  const integration = useMemo(
    () => integrationsQuery.data?.find((item) => item.providerType === 'coolify') ?? null,
    [integrationsQuery.data],
  );
  const [draft, setDraft] = useState<{
    baseUrl: string;
    adminToken: string;
    serverId: string;
    destinationId: string;
    applicationsBaseDomain: string;
    isEnabled: boolean;
  } | null>(null);
  const mutation = useMutation({
    mutationFn: upsertSystemIntegration,
    onSuccess: async () => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-integrations'] });
    },
  });
  const baseUrl = draft?.baseUrl ?? (integration?.config?.baseUrl ?? '');
  const adminToken = draft?.adminToken ?? (integration?.config?.adminToken ?? '');
  const serverId = draft?.serverId ?? (integration?.config?.serverId ?? '');
  const destinationId = draft?.destinationId ?? (integration?.config?.destinationId ?? '');
  const applicationsBaseDomain = draft?.applicationsBaseDomain ?? (integration?.config?.applicationsBaseDomain ?? '');
  const isEnabled = draft?.isEnabled ?? (integration?.isEnabled ?? true);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader title="Coolify" />

      <div className="max-w-3xl space-y-5">
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({
              providerType: 'coolify',
              isEnabled,
              config: {
                baseUrl: baseUrl.trim(),
                adminToken: adminToken.trim(),
                serverId: serverId.trim(),
                destinationId: destinationId.trim(),
                applicationsBaseDomain: applicationsBaseDomain.trim() || undefined,
              },
            });
          }}
        >
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="coolify-base-url">Base URL</label>
            <AdminInput id="coolify-base-url" value={baseUrl} onChange={(event) => setDraft((current) => ({ baseUrl: event.target.value, adminToken: current?.adminToken ?? integration?.config?.adminToken ?? '', serverId: current?.serverId ?? integration?.config?.serverId ?? '', destinationId: current?.destinationId ?? integration?.config?.destinationId ?? '', applicationsBaseDomain: current?.applicationsBaseDomain ?? integration?.config?.applicationsBaseDomain ?? '', isEnabled: current?.isEnabled ?? integration?.isEnabled ?? true }))} disabled={mutation.isPending} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="coolify-admin-token">Admin token</label>
            <AdminInput id="coolify-admin-token" type="password" value={adminToken} onChange={(event) => setDraft((current) => ({ baseUrl: current?.baseUrl ?? integration?.config?.baseUrl ?? '', adminToken: event.target.value, serverId: current?.serverId ?? integration?.config?.serverId ?? '', destinationId: current?.destinationId ?? integration?.config?.destinationId ?? '', applicationsBaseDomain: current?.applicationsBaseDomain ?? integration?.config?.applicationsBaseDomain ?? '', isEnabled: current?.isEnabled ?? integration?.isEnabled ?? true }))} disabled={mutation.isPending} />
          </div>
          <div className="grid gap-4 min-[720px]:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="coolify-server-id">Server ID</label>
              <AdminInput id="coolify-server-id" value={serverId} onChange={(event) => setDraft((current) => ({ baseUrl: current?.baseUrl ?? integration?.config?.baseUrl ?? '', adminToken: current?.adminToken ?? integration?.config?.adminToken ?? '', serverId: event.target.value, destinationId: current?.destinationId ?? integration?.config?.destinationId ?? '', applicationsBaseDomain: current?.applicationsBaseDomain ?? integration?.config?.applicationsBaseDomain ?? '', isEnabled: current?.isEnabled ?? integration?.isEnabled ?? true }))} disabled={mutation.isPending} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="coolify-destination-id">Destination ID</label>
              <AdminInput id="coolify-destination-id" value={destinationId} onChange={(event) => setDraft((current) => ({ baseUrl: current?.baseUrl ?? integration?.config?.baseUrl ?? '', adminToken: current?.adminToken ?? integration?.config?.adminToken ?? '', serverId: current?.serverId ?? integration?.config?.serverId ?? '', destinationId: event.target.value, applicationsBaseDomain: current?.applicationsBaseDomain ?? integration?.config?.applicationsBaseDomain ?? '', isEnabled: current?.isEnabled ?? integration?.isEnabled ?? true }))} disabled={mutation.isPending} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="coolify-applications-base-domain">Applications base domain</label>
            <AdminInput id="coolify-applications-base-domain" value={applicationsBaseDomain} onChange={(event) => setDraft((current) => ({ baseUrl: current?.baseUrl ?? integration?.config?.baseUrl ?? '', adminToken: current?.adminToken ?? integration?.config?.adminToken ?? '', serverId: current?.serverId ?? integration?.config?.serverId ?? '', destinationId: current?.destinationId ?? integration?.config?.destinationId ?? '', applicationsBaseDomain: event.target.value, isEnabled: current?.isEnabled ?? integration?.isEnabled ?? true }))} disabled={mutation.isPending} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="coolify-status">Status</label>
            <Select value={isEnabled ? 'enabled' : 'disabled'} onValueChange={(value) => setDraft((current) => ({ baseUrl: current?.baseUrl ?? integration?.config?.baseUrl ?? '', adminToken: current?.adminToken ?? integration?.config?.adminToken ?? '', serverId: current?.serverId ?? integration?.config?.serverId ?? '', destinationId: current?.destinationId ?? integration?.config?.destinationId ?? '', applicationsBaseDomain: current?.applicationsBaseDomain ?? integration?.config?.applicationsBaseDomain ?? '', isEnabled: value === 'enabled' }))} disabled={mutation.isPending}>
              <SelectTrigger id="coolify-status" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="enabled">Ativa</SelectItem>
                <SelectItem value="disabled">Inativa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {integrationsQuery.error ? <div className="text-sm text-destructive">{integrationsQuery.error.message}</div> : null}
          {mutation.error ? <div className="text-sm text-destructive">{mutation.error.message}</div> : null}
          <div className="flex justify-end">
            <AdminButton type="submit" disabled={mutation.isPending || !baseUrl.trim() || !adminToken.trim() || !serverId.trim() || !destinationId.trim()}>
              {mutation.isPending ? 'Salvando...' : 'Salvar'}
            </AdminButton>
          </div>
        </form>
      </div>
    </div>
  );
}
