import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { AdminButton, AdminInput, PageHeader } from '@/components/admin';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getSystemIntegrations, upsertSystemIntegration } from '@/lib/admin-api';

export const Route = createFileRoute('/integrations/migadu/')({
  component: IntegrationsMigaduRoute,
});

function IntegrationsMigaduRoute() {
  const queryClient = useQueryClient();
  const integrationsQuery = useQuery({
    queryKey: ['admin', 'system-integrations'],
    queryFn: getSystemIntegrations,
  });
  const integration = useMemo(
    () => integrationsQuery.data?.find((item) => item.providerType === 'migadu') ?? null,
    [integrationsQuery.data],
  );
  const [draft, setDraft] = useState<{
    apiUser: string;
    apiKey: string;
    isEnabled: boolean;
  } | null>(null);
  const mutation = useMutation({
    mutationFn: upsertSystemIntegration,
    onSuccess: async () => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-integrations'] });
    },
  });
  const apiUser = draft?.apiUser ?? (integration?.config?.apiUser ?? '');
  const apiKey = draft?.apiKey ?? (integration?.config?.apiKey ?? '');
  const isEnabled = draft?.isEnabled ?? (integration?.isEnabled ?? true);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader title="Migadu" />

      <div className="max-w-3xl space-y-5">
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({
              providerType: 'migadu',
              isEnabled,
              config: {
                apiUser: apiUser.trim(),
                apiKey: apiKey.trim(),
              },
            });
          }}
        >
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="migadu-api-user">API user</label>
            <AdminInput id="migadu-api-user" value={apiUser} onChange={(event) => setDraft((current) => ({ apiUser: event.target.value, apiKey: current?.apiKey ?? integration?.config?.apiKey ?? '', isEnabled: current?.isEnabled ?? integration?.isEnabled ?? true }))} disabled={mutation.isPending} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="migadu-api-key">API key</label>
            <AdminInput id="migadu-api-key" type="password" value={apiKey} onChange={(event) => setDraft((current) => ({ apiUser: current?.apiUser ?? integration?.config?.apiUser ?? '', apiKey: event.target.value, isEnabled: current?.isEnabled ?? integration?.isEnabled ?? true }))} disabled={mutation.isPending} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="migadu-status">Status</label>
            <Select value={isEnabled ? 'enabled' : 'disabled'} onValueChange={(value) => setDraft((current) => ({ apiUser: current?.apiUser ?? integration?.config?.apiUser ?? '', apiKey: current?.apiKey ?? integration?.config?.apiKey ?? '', isEnabled: value === 'enabled' }))} disabled={mutation.isPending}>
              <SelectTrigger id="migadu-status" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="enabled">Ativa</SelectItem>
                <SelectItem value="disabled">Inativa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {integrationsQuery.error ? <div className="text-sm text-destructive">{integrationsQuery.error.message}</div> : null}
          {mutation.error ? <div className="text-sm text-destructive">{mutation.error.message}</div> : null}
          <div className="flex justify-end">
            <AdminButton type="submit" disabled={mutation.isPending || !apiUser.trim() || !apiKey.trim()}>
              {mutation.isPending ? 'Salvando...' : 'Salvar'}
            </AdminButton>
          </div>
        </form>
      </div>
    </div>
  );
}
