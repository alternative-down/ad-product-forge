import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { AdminButton, AdminInput, AdminLoadingState, PageHeader } from '@/components/admin';
import { Switch } from '@/components/ui/switch';
import { getSystemIntegrations, upsertSystemIntegration } from '@/lib/admin-api';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';

export const Route = createFileRoute('/integrations/minimax/')({
  component: SystemMinimaxSettingsPage,
});

export function SystemMinimaxSettingsPage() {
  const queryClient = useQueryClient();
  const integrationsQuery = useQuery({
    queryKey: ['admin', 'system-integrations'],
    queryFn: getSystemIntegrations,
  });
  const integration = useMemo(
    () => integrationsQuery.data?.find((item) => item.providerType === 'minimax') ?? null,
    [integrationsQuery.data],
  );
  const [draft, setDraft] = useState<{
    apiKey: string;
    isEnabled: boolean;
  } | null>(null);
  const mutation = useMutation({
    mutationFn: upsertSystemIntegration,
    onMutate: () => startAdminAction('Salvando MiniMax...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'MiniMax atualizado.');
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-integrations'] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const apiKey = draft?.apiKey ?? (integration?.config?.apiKey ?? '');
  const isEnabled = draft?.isEnabled ?? (integration?.isEnabled ?? false);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {integrationsQuery.isLoading && !integrationsQuery.data ? <AdminLoadingState label="Carregando MiniMax..." /> : null}
      <PageHeader
        title="MiniMax"
        description="Conecta o sistema ao MiniMax para geração de voz, imagem e vídeo usada pelas tools dos agentes."
      />

      <div className="max-w-3xl space-y-5">
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({
              providerType: 'minimax',
              isEnabled,
              config: {
                apiKey: apiKey.trim(),
              },
            });
          }}
        >
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="minimax-api-key">API key</label>
            <AdminInput id="minimax-api-key" type="password" value={apiKey} onChange={(event) => setDraft((current) => ({ apiKey: event.target.value, isEnabled: current?.isEnabled ?? integration?.isEnabled ?? true }))} disabled={mutation.isPending} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="minimax-status">Ativo</label>
            <div className="flex min-h-9 items-center">
              <Switch id="minimax-status" checked={isEnabled} onCheckedChange={(checked) => setDraft((current) => ({ apiKey: current?.apiKey ?? integration?.config?.apiKey ?? '', isEnabled: checked }))} disabled={mutation.isPending} />
            </div>
          </div>
          {integrationsQuery.error ? <div className="text-sm text-destructive">{integrationsQuery.error.message}</div> : null}
          {mutation.error ? <div className="text-sm text-destructive">{mutation.error.message}</div> : null}
          <div className="flex justify-end">
            <AdminButton type="submit" disabled={mutation.isPending || !apiKey.trim()}>
              {mutation.isPending ? 'Salvando...' : 'Salvar'}
            </AdminButton>
          </div>
        </form>
      </div>
    </div>
  );
}
