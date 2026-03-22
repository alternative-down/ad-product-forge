import { type ReactNode, useState } from 'react';
import { Cable, LoaderCircle, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  deleteSystemIntegration,
  listSystemIntegrations,
  upsertSystemIntegration,
  type SystemIntegration,
  type UpsertSystemIntegrationInput,
} from '../../lib/api';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { formatDateTime } from '../../lib/format';

type MigaduDraft = {
  isEnabled: boolean;
  apiUser: string;
  apiKey: string;
};

type CoolifyDraft = {
  isEnabled: boolean;
  baseUrl: string;
  adminToken: string;
  applicationsBaseDomain: string;
};

export function SystemPage() {
  const queryClient = useQueryClient();
  const integrationsQuery = useQuery({
    queryKey: ['admin', 'system-integrations'],
    queryFn: listSystemIntegrations,
  });
  const upsertMutation = useMutation({
    mutationFn: upsertSystemIntegration,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-integrations'] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteSystemIntegration,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-integrations'] });
    },
  });

  if (integrationsQuery.isLoading) {
    return <PanelLoading label="Loading system integrations" />;
  }

  if (integrationsQuery.isError) {
    return <PanelError message={integrationsQuery.error.message} />;
  }

  const integrations = integrationsQuery.data ?? [];
  const migaduIntegration = integrations.find((integration) => integration.providerType === 'migadu') ?? null;
  const coolifyIntegration = integrations.find((integration) => integration.providerType === 'coolify') ?? null;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">System integrations</h2>
            <p className="mt-1 text-sm text-slate-500">
              Global provider configuration for Forge runtime services.
            </p>
          </div>
          <Cable className="h-5 w-5 text-slate-500" />
        </div>
      </Card>

      <MigaduIntegrationCard
        key={`migadu-${migaduIntegration?.updatedAt ?? 'new'}`}
        integration={migaduIntegration}
        pending={upsertMutation.isPending && upsertMutation.variables?.providerType === 'migadu'}
        deleting={deleteMutation.isPending && deleteMutation.variables === 'migadu'}
        error={getIntegrationError(
          'migadu',
          upsertMutation.error?.message,
          deleteMutation.error?.message,
          upsertMutation.variables,
          deleteMutation.variables,
        )}
        onDelete={() => deleteMutation.mutate('migadu')}
        onSave={(input) => upsertMutation.mutate(input)}
      />

      <CoolifyIntegrationCard
        key={`coolify-${coolifyIntegration?.updatedAt ?? 'new'}`}
        integration={coolifyIntegration}
        pending={upsertMutation.isPending && upsertMutation.variables?.providerType === 'coolify'}
        deleting={deleteMutation.isPending && deleteMutation.variables === 'coolify'}
        error={getIntegrationError(
          'coolify',
          upsertMutation.error?.message,
          deleteMutation.error?.message,
          upsertMutation.variables,
          deleteMutation.variables,
        )}
        onDelete={() => deleteMutation.mutate('coolify')}
        onSave={(input) => upsertMutation.mutate(input)}
      />
    </div>
  );
}

function MigaduIntegrationCard(input: {
  integration: SystemIntegration | null;
  pending: boolean;
  deleting: boolean;
  error: string | null;
  onDelete(): void;
  onSave(input: Extract<UpsertSystemIntegrationInput, { providerType: 'migadu' }>): void;
}) {
  const initialDraft = getMigaduDraft(input.integration);
  const [draft, setDraft] = useState(initialDraft);

  return (
    <IntegrationCard
      title="Migadu"
      integration={input.integration}
      pending={input.pending}
      deleting={input.deleting}
      error={input.error}
      onDelete={input.onDelete}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <LabeledField label="API user">
          <Input
            value={draft.apiUser}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                apiUser: event.target.value,
              }))
            }
            placeholder="admin@example.com"
          />
        </LabeledField>
        <LabeledField label="API key">
          <Input
            value={draft.apiKey}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                apiKey: event.target.value,
              }))
            }
            placeholder="Migadu API key"
          />
        </LabeledField>
      </div>
      <label className="mt-4 flex items-center gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={draft.isEnabled}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              isEnabled: event.target.checked,
            }))
          }
        />
        Enable Migadu provisioning
      </label>
      <div className="mt-5 flex gap-3">
        <Button
          type="button"
          disabled={input.pending}
          onClick={() =>
            input.onSave({
              providerType: 'migadu',
              isEnabled: draft.isEnabled,
              config: {
                apiUser: draft.apiUser,
                apiKey: draft.apiKey,
              },
            })
          }
        >
          Save Migadu
        </Button>
      </div>
    </IntegrationCard>
  );
}

function CoolifyIntegrationCard(input: {
  integration: SystemIntegration | null;
  pending: boolean;
  deleting: boolean;
  error: string | null;
  onDelete(): void;
  onSave(input: Extract<UpsertSystemIntegrationInput, { providerType: 'coolify' }>): void;
}) {
  const initialDraft = getCoolifyDraft(input.integration);
  const [draft, setDraft] = useState(initialDraft);

  return (
    <IntegrationCard
      title="Coolify"
      integration={input.integration}
      pending={input.pending}
      deleting={input.deleting}
      error={input.error}
      onDelete={input.onDelete}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <LabeledField label="Base URL">
          <Input
            value={draft.baseUrl}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                baseUrl: event.target.value,
              }))
            }
            placeholder="https://coolify.example.com"
          />
        </LabeledField>
        <LabeledField label="Admin token">
          <Input
            value={draft.adminToken}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                adminToken: event.target.value,
              }))
            }
            placeholder="Coolify admin token"
          />
        </LabeledField>
        <LabeledField label="Applications base domain">
          <Input
            value={draft.applicationsBaseDomain}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                applicationsBaseDomain: event.target.value,
              }))
            }
            placeholder="apps.example.com"
          />
        </LabeledField>
      </div>
      <label className="mt-4 flex items-center gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={draft.isEnabled}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              isEnabled: event.target.checked,
            }))
          }
        />
        Enable Coolify deployment tools
      </label>
      <div className="mt-5 flex gap-3">
        <Button
          type="button"
          disabled={input.pending}
          onClick={() =>
            input.onSave({
              providerType: 'coolify',
              isEnabled: draft.isEnabled,
              config: {
                baseUrl: draft.baseUrl,
                adminToken: draft.adminToken,
                applicationsBaseDomain: draft.applicationsBaseDomain,
              },
            })
          }
        >
          Save Coolify
        </Button>
      </div>
    </IntegrationCard>
  );
}

function IntegrationCard(input: {
  title: string;
  integration: SystemIntegration | null;
  pending: boolean;
  deleting: boolean;
  error: string | null;
  onDelete(): void;
  children: ReactNode;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{input.title}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {input.integration
              ? `Updated ${formatDateTime(input.integration.updatedAt)}`
              : 'Not configured yet'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {input.pending && <LoaderCircle className="h-4 w-4 animate-spin text-slate-500" />}
          {input.integration && (
            <Button
              type="button"
              variant="secondary"
              onClick={input.onDelete}
              disabled={input.deleting}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>
      <div className="mt-5">{input.children}</div>
      {input.error && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {input.error}
        </div>
      )}
    </Card>
  );
}

function LabeledField(input: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm text-slate-600">
      <span className="font-medium text-slate-700">{input.label}</span>
      {input.children}
    </label>
  );
}

function getIntegrationError(
  providerType: UpsertSystemIntegrationInput['providerType'],
  upsertError: string | null | undefined,
  deleteError: string | null | undefined,
  currentUpsertInput: UpsertSystemIntegrationInput | undefined,
  deletingProviderType: 'migadu' | 'coolify' | undefined,
) {
  if (currentUpsertInput?.providerType === providerType && upsertError) {
    return upsertError;
  }

  if (deletingProviderType === providerType && deleteError) {
    return deleteError;
  }

  return null;
}

function getMigaduDraft(integration: SystemIntegration | null): MigaduDraft {
  if (!integration || !('apiUser' in integration.config)) {
    return {
      isEnabled: true,
      apiUser: '',
      apiKey: '',
    };
  }

  return {
    isEnabled: integration.isEnabled,
    apiUser: integration.config.apiUser,
    apiKey: integration.config.apiKey,
  };
}

function getCoolifyDraft(integration: SystemIntegration | null): CoolifyDraft {
  if (!integration || !('baseUrl' in integration.config)) {
    return {
      isEnabled: true,
      baseUrl: '',
      adminToken: '',
      applicationsBaseDomain: '',
    };
  }

  return {
    isEnabled: integration.isEnabled,
    baseUrl: integration.config.baseUrl,
    adminToken: integration.config.adminToken,
    applicationsBaseDomain: integration.config.applicationsBaseDomain,
  };
}

function PanelLoading(input: { label: string }) {
  return <Card className="p-6 text-sm text-slate-600">{input.label}</Card>;
}

function PanelError(input: { message: string }) {
  return <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">{input.message}</Card>;
}
