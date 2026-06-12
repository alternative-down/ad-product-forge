import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { Switch } from '@/components/ui/switch';
import { getSystemIntegrations, upsertSystemIntegration } from '@/lib/admin-api/index';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';
import type { SystemIntegration } from '@/lib/admin-api/index';
import { buildCoolifyFormValues, type CoolifyFormValues } from './coolify-form-state';

import { AdminLoadingState } from '@/components/admin/./system/admin-loading-state';
export const Route = createFileRoute('/settings/coolify/')({
  component: SettingsCoolifyRoute,
});

function SettingsCoolifyRoute() {
  const queryClient = useQueryClient();

  const integrationsQuery = useQuery({
    queryKey: ['admin', 'system-integrations'],
    queryFn: getSystemIntegrations,
  });
  const integration = useMemo(
    () => integrationsQuery.data?.find((item) => item.providerType === 'coolify') ?? null,
    [integrationsQuery.data],
  );

  const [liveDraft, setLiveDraft] = useState<CoolifyFormValues | null>(null);

  const patchLiveDraft = useCallback(
    (partial: Partial<CoolifyFormValues>) => {
      setLiveDraft((current) =>
        buildCoolifyFormValues(
          current !== null ? { ...current, ...partial } : (partial as CoolifyFormValues),
          integration,
        ),
      );
    },
    [integration],
  );

  const resetDraft = useCallback(() => {
    setLiveDraft(null);
  }, []);

  const formValues: CoolifyFormValues = useMemo(
    () => buildCoolifyFormValues(liveDraft, integration),
    [liveDraft, integration],
  );

  const mutation = useMutation({
    mutationFn: upsertSystemIntegration,
    onMutate: () => startAdminAction('Salvando Coolify...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Coolify atualizado.');
      resetDraft();
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-integrations'] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });

  const submitDisabled =
    mutation.isPending ||
    !formValues.baseUrl.trim() ||
    !formValues.adminToken.trim() ||
    !formValues.serverId.trim() ||
    !formValues.destinationId.trim();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    mutation.mutate({
      providerType: 'coolify',
      isEnabled: formValues.isEnabled,
      config: {
        baseUrl: formValues.baseUrl.trim(),
        adminToken: formValues.adminToken.trim(),
        serverId: formValues.serverId.trim(),
        destinationId: formValues.destinationId.trim(),
        applicationsBaseDomain: formValues.applicationsBaseDomain.trim() || undefined,
      },
    });
  }

  function handleCheckedChange(checked: boolean) {
    patchLiveDraft({ isEnabled: checked });
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {integrationsQuery.isLoading && !integrationsQuery.data ? (
        <AdminLoadingState label="Carregando Coolify..." />
      ) : null}
      <PageHeader
        title="Coolify"
        description="Conecta o sistema ao Coolify para criar e operar aplicações e ambientes."
      />

      <div className="max-w-3xl space-y-5">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <TextField
            id="coolify-base-url"
            label="Base URL"
            value={formValues.baseUrl}
            onChange={(value) => patchLiveDraft({ baseUrl: value })}
            disabled={mutation.isPending}
          />
          <TextField
            id="coolify-admin-token"
            label="Admin token"
            value={formValues.adminToken}
            onChange={(value) => patchLiveDraft({ adminToken: value })}
            type="password"
            disabled={mutation.isPending}
          />
          <div className="grid grid-cols-2 gap-4">
            <TextField
              id="coolify-server-id"
              label="Server ID"
              value={formValues.serverId}
              onChange={(value) => patchLiveDraft({ serverId: value })}
              disabled={mutation.isPending}
            />
            <TextField
              id="coolify-destination-id"
              label="Destination ID"
              value={formValues.destinationId}
              onChange={(value) => patchLiveDraft({ destinationId: value })}
              disabled={mutation.isPending}
            />
          </div>
          <TextField
            id="coolify-applications-base-domain"
            label="Applications base domain"
            value={formValues.applicationsBaseDomain}
            onChange={(value) => patchLiveDraft({ applicationsBaseDomain: value })}
            disabled={mutation.isPending}
          />
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="coolify-status">
              Ativo
            </label>
            <div className="flex min-h-9 items-center">
              <Switch
                id="coolify-status"
                checked={formValues.isEnabled}
                onCheckedChange={handleCheckedChange}
                disabled={mutation.isPending}
              />
            </div>
          </div>
          {integrationsQuery.error ? (
            <div className="text-sm text-destructive">{integrationsQuery.error.message}</div>
          ) : null}
          {mutation.error ? (
            <div className="text-sm text-destructive">{mutation.error.message}</div>
          ) : null}
          <div className="flex justify-end">
            <AdminButton type="submit" disabled={submitDisabled}>
              {mutation.isPending ? 'Salvando...' : 'Salvar'}
            </AdminButton>
          </div>
        </form>
      </div>
    </div>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled: boolean;
}

function TextField({ id, label, value, onChange, type, disabled }: TextFieldProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <AdminInput
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
