import { type ReactNode, useMemo, useState } from 'react';
import { Bot, Cable, LoaderCircle, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  deleteLlmProfile,
  deleteSystemIntegration,
  getSystemOauth,
  getSystemLlm,
  getSystemSettings,
  getSystemMigrations,
  listSystemIntegrations,
  syncSystemOauth,
  updateSystemLlmDefaults,
  upsertLlmModelPrice,
  upsertLlmProfile,
  upsertSystemSettings,
  upsertSystemIntegration,
  type LlmProfile,
  type UpsertLlmModelPriceInput,
  type SystemIntegration,
  type SystemLlmDefaults,
  type SystemMigrationsResponse,
  type SystemOauthState,
  type SystemSettings,
  type UpdateSystemLlmDefaultsInput,
  type UpsertLlmProfileInput,
  type UpsertSystemIntegrationInput,
} from '../../lib/api';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Select } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { formatDateTime } from '../../lib/format';
import { MetricStrip, PageHeader } from '../../components/layout/page-header';

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

type GitHubDraft = {
  isEnabled: boolean;
  organization: string;
  appHomeUrl: string;
};

type LlmProfileDraft = {
  profileId?: string;
  name: string;
  modelKey: string;
  baseUrl: string;
  apiKey: string;
  contractCostMultiplier: number;
  isEnabled: boolean;
};

type LlmModelPriceDraft = UpsertLlmModelPriceInput;

export function SystemPage() {
  const queryClient = useQueryClient();
  const integrationsQuery = useQuery({
    queryKey: ['admin', 'system-integrations'],
    queryFn: listSystemIntegrations,
  });
  const llmQuery = useQuery({
    queryKey: ['admin', 'system-llm'],
    queryFn: getSystemLlm,
  });
  const settingsQuery = useQuery({
    queryKey: ['admin', 'system-settings'],
    queryFn: getSystemSettings,
  });
  const oauthQuery = useQuery({
    queryKey: ['admin', 'system-oauth'],
    queryFn: getSystemOauth,
  });
  const migrationsQuery = useQuery({
    queryKey: ['admin', 'system-migrations'],
    queryFn: getSystemMigrations,
  });
  const upsertIntegrationMutation = useMutation({
    mutationFn: upsertSystemIntegration,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-integrations'] });
    },
  });
  const deleteIntegrationMutation = useMutation({
    mutationFn: deleteSystemIntegration,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-integrations'] });
    },
  });
  const upsertLlmProfileMutation = useMutation({
    mutationFn: upsertLlmProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-llm'] });
    },
  });
  const deleteLlmProfileMutation = useMutation({
    mutationFn: deleteLlmProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-llm'] });
    },
  });
  const updateLlmDefaultsMutation = useMutation({
    mutationFn: updateSystemLlmDefaults,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-llm'] });
    },
  });
  const syncOauthMutation = useMutation({
    mutationFn: syncSystemOauth,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-oauth'] });
    },
  });
  const upsertLlmModelPriceMutation = useMutation({
    mutationFn: upsertLlmModelPrice,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-llm'] });
    },
  });
  const upsertSystemSettingsMutation = useMutation({
    mutationFn: upsertSystemSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-settings'] });
    },
  });

  if (integrationsQuery.isLoading || llmQuery.isLoading || settingsQuery.isLoading || oauthQuery.isLoading || migrationsQuery.isLoading) {
    return <PanelLoading label="Loading system configuration" />;
  }

  if (integrationsQuery.isError) {
    return <PanelError message={integrationsQuery.error.message} />;
  }

  if (llmQuery.isError) {
    return <PanelError message={llmQuery.error.message} />;
  }

  if (settingsQuery.isError) {
    return <PanelError message={settingsQuery.error.message} />;
  }

  if (oauthQuery.isError) {
    return <PanelError message={oauthQuery.error.message} />;
  }

  if (migrationsQuery.isError) {
    return <PanelError message={migrationsQuery.error.message} />;
  }

  const integrations = integrationsQuery.data ?? [];
  const migaduIntegration = integrations.find((integration) => integration.providerType === 'migadu') ?? null;
  const coolifyIntegration = integrations.find((integration) => integration.providerType === 'coolify') ?? null;
  const githubIntegration = integrations.find((integration) => integration.providerType === 'github') ?? null;
  const systemLlm = llmQuery.data!;
  const systemSettings = settingsQuery.data!;
  const oauthState = oauthQuery.data!;
  const migrations = migrationsQuery.data!;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="Global runtime wiring"
        description="This surface controls shared company context, model defaults, provider integrations, OAuth sync, and migration visibility. It should feel like infrastructure, not an assorted form dump."
        aside={
          <div className="rounded-[1.5rem] border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] px-5 py-4">
            <div className="flex items-center gap-3 text-[color:var(--muted-strong)]">
              <Cable className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em]">
                Runtime plane
              </span>
            </div>
            <div className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
              Edit global settings here. Agent-local state belongs on the agent page.
            </div>
          </div>
        }
      />

      <MetricStrip
        items={[
          {
            label: 'LLM profiles',
            value: systemLlm.profiles.length,
            detail: `${systemLlm.prices.length} price rows`,
          },
          {
            label: 'Integrations',
            value: integrations.length,
            detail: integrations.filter((integration) => integration.isEnabled).length + ' enabled',
          },
          {
            label: 'OAuth sources',
            value: Object.keys(oauthState).length,
            detail: 'sync-capable providers',
          },
          {
            label: 'Migrations',
            value: migrations.applied.length,
            detail: `${migrations.entries.filter((entry) => !entry.applied).length} pending`,
          },
        ]}
      />

      <SystemSettingsCard
        key={`system-settings-${systemSettings.updatedAt ?? 'unset'}`}
        settings={systemSettings}
        pending={upsertSystemSettingsMutation.isPending}
        error={upsertSystemSettingsMutation.error?.message ?? null}
        onSave={(input) => upsertSystemSettingsMutation.mutate(input)}
      />

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--muted-strong)]">
              Models
            </div>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">LLM configuration</h2>
            <p className="mt-1 text-sm text-slate-500">
              Profiles define provider plus model pairs. Defaults drive internal hiring and OM selection.
            </p>
          </div>
          <Bot className="h-5 w-5 text-slate-500" />
        </div>
      </Card>

      <LlmDefaultsCard
        key={`llm-defaults-${systemLlm.defaults?.updatedAt ?? 'unset'}`}
        defaults={systemLlm.defaults}
        profiles={systemLlm.profiles}
        pending={updateLlmDefaultsMutation.isPending}
        error={updateLlmDefaultsMutation.error?.message ?? null}
        onSave={(input) => updateLlmDefaultsMutation.mutate(input)}
      />

      <LlmProfileEditorCard
        profiles={systemLlm.profiles}
        pending={upsertLlmProfileMutation.isPending}
        deletingProfileId={deleteLlmProfileMutation.isPending ? deleteLlmProfileMutation.variables ?? null : null}
        saveError={upsertLlmProfileMutation.error?.message ?? null}
        deleteError={deleteLlmProfileMutation.error?.message ?? null}
        onSave={(input) => upsertLlmProfileMutation.mutate(input)}
        onDelete={(profileId) => deleteLlmProfileMutation.mutate(profileId)}
      />

      <LlmPricingCard
        prices={systemLlm.prices}
        pending={upsertLlmModelPriceMutation.isPending}
        error={upsertLlmModelPriceMutation.error?.message ?? null}
        onSave={(input) => upsertLlmModelPriceMutation.mutate(input)}
      />

      <OauthSyncCard
        state={oauthState}
        pendingProviderId={syncOauthMutation.isPending ? syncOauthMutation.variables : null}
        error={syncOauthMutation.error?.message ?? null}
        result={syncOauthMutation.data ?? null}
        onSync={(providerId) => syncOauthMutation.mutate(providerId)}
      />

      <MigrationStatusCard migrations={migrations} />

      <MigaduIntegrationCard
        key={`migadu-${migaduIntegration?.updatedAt ?? 'new'}`}
        integration={migaduIntegration}
        pending={upsertIntegrationMutation.isPending && upsertIntegrationMutation.variables?.providerType === 'migadu'}
        deleting={deleteIntegrationMutation.isPending && deleteIntegrationMutation.variables === 'migadu'}
        error={getIntegrationError(
          'migadu',
          upsertIntegrationMutation.error?.message,
          deleteIntegrationMutation.error?.message,
          upsertIntegrationMutation.variables,
          deleteIntegrationMutation.variables,
        )}
        onDelete={() => deleteIntegrationMutation.mutate('migadu')}
        onSave={(input) => upsertIntegrationMutation.mutate(input)}
      />

      <CoolifyIntegrationCard
        key={`coolify-${coolifyIntegration?.updatedAt ?? 'new'}`}
        integration={coolifyIntegration}
        pending={upsertIntegrationMutation.isPending && upsertIntegrationMutation.variables?.providerType === 'coolify'}
        deleting={deleteIntegrationMutation.isPending && deleteIntegrationMutation.variables === 'coolify'}
        error={getIntegrationError(
          'coolify',
          upsertIntegrationMutation.error?.message,
          deleteIntegrationMutation.error?.message,
          upsertIntegrationMutation.variables,
          deleteIntegrationMutation.variables,
        )}
        onDelete={() => deleteIntegrationMutation.mutate('coolify')}
        onSave={(input) => upsertIntegrationMutation.mutate(input)}
      />

      <GitHubIntegrationCard
        key={`github-${githubIntegration?.updatedAt ?? 'new'}`}
        integration={githubIntegration}
        pending={upsertIntegrationMutation.isPending && upsertIntegrationMutation.variables?.providerType === 'github'}
        deleting={deleteIntegrationMutation.isPending && deleteIntegrationMutation.variables === 'github'}
        error={getIntegrationError(
          'github',
          upsertIntegrationMutation.error?.message,
          deleteIntegrationMutation.error?.message,
          upsertIntegrationMutation.variables,
          deleteIntegrationMutation.variables,
        )}
        onDelete={() => deleteIntegrationMutation.mutate('github')}
        onSave={(input) => upsertIntegrationMutation.mutate(input)}
      />

    </div>
  );
}

function SystemSettingsCard(input: {
  settings: SystemSettings;
  pending: boolean;
  error: string | null;
  onSave(input: {
    companyName: string;
    companyContext: string;
  }): void;
}) {
  const [draft, setDraft] = useState({
    companyName: input.settings.companyName,
    companyContext: input.settings.companyContext,
  });

  const changed =
    draft.companyName !== input.settings.companyName ||
    draft.companyContext !== input.settings.companyContext;

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Company context</h2>
          <p className="mt-1 text-sm text-slate-500">
            Global company information injected into the system prompt of loaded agents.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <LabeledField label="Company name">
          <Input
            value={draft.companyName}
            onChange={(event) => setDraft({
              ...draft,
              companyName: event.target.value,
            })}
            placeholder="Alternative Down"
          />
        </LabeledField>

        <LabeledField label="Company information">
          <Textarea
            value={draft.companyContext}
            onChange={(event) => setDraft({
              ...draft,
              companyContext: event.target.value,
            })}
            rows={8}
            placeholder="Describe the company, business model, operating context, and any fixed information every agent should know."
          />
        </LabeledField>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="text-sm text-rose-600">{input.error ?? ''}</div>
        <Button
          disabled={!changed || input.pending}
          onClick={() => input.onSave({
            companyName: draft.companyName,
            companyContext: draft.companyContext,
          })}
        >
          {input.pending ? 'Saving...' : 'Save company context'}
        </Button>
      </div>
    </Card>
  );
}

function MigrationStatusCard(input: {
  migrations: SystemMigrationsResponse;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Application migrations</h3>
          <p className="mt-1 text-sm text-slate-500">
            Journal entries from the repo matched against rows stored in <code>__drizzle_migrations</code>.
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-2 pr-4 font-medium">Idx</th>
              <th className="py-2 pr-4 font-medium">Tag</th>
              <th className="py-2 pr-4 font-medium">Applied</th>
              <th className="py-2 pr-4 font-medium">Created at</th>
              <th className="py-2 pr-4 font-medium">Row id</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {input.migrations.entries.map((entry) => (
              <tr key={entry.tag}>
                <td className="py-2 pr-4 text-slate-600">{entry.idx}</td>
                <td className="py-2 pr-4 font-mono text-xs text-slate-900">{entry.tag}</td>
                <td className="py-2 pr-4">
                  <span className={entry.applied ? 'text-emerald-700' : 'text-amber-700'}>
                    {entry.applied ? 'applied' : 'pending'}
                  </span>
                </td>
                <td className="py-2 pr-4 text-slate-600">{formatDateTime(entry.createdAt)}</td>
                <td className="py-2 pr-4 text-slate-600">{entry.rowId ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function LlmPricingCard(input: {
  prices: Array<{
    modelKey: string;
    inputPerMillionUsd: number;
    inputCachePerMillionUsd: number;
    outputPerMillionUsd: number;
    createdAt: number;
    updatedAt: number;
  }>;
  pending: boolean;
  error: string | null;
  onSave(input: UpsertLlmModelPriceInput): void;
}) {
  const [selectedModelKey, setSelectedModelKey] = useState<string>('new');
  const selectedPrice = input.prices.find((price) => price.modelKey === selectedModelKey) ?? null;
  const [draft, setDraft] = useState<LlmModelPriceDraft>(buildLlmModelPriceDraft(selectedPrice));

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">LLM model prices</h3>
          <p className="mt-1 text-sm text-slate-500">
            Pricing is used by hiring and contract accounting. Add or adjust any model key here.
          </p>
        </div>
        {input.pending ? <LoaderCircle className="h-4 w-4 animate-spin text-slate-500" /> : null}
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="space-y-4">
          <LabeledField label="Edit price">
            <Select
              value={selectedModelKey}
              onChange={(event) => {
                const nextModelKey = event.target.value;
                const nextSelectedPrice = input.prices.find((price) => price.modelKey === nextModelKey) ?? null;
                setSelectedModelKey(nextModelKey);
                setDraft(buildLlmModelPriceDraft(nextSelectedPrice));
              }}
            >
              <option value="new">Create new price</option>
              {input.prices.map((price) => (
                <option key={price.modelKey} value={price.modelKey}>
                  {price.modelKey}
                </option>
              ))}
            </Select>
          </LabeledField>

          <div className="grid gap-4 md:grid-cols-2">
            <LabeledField label="Model key">
              <Input
                value={draft.modelKey}
                onChange={(event) => setDraft((current) => ({ ...current, modelKey: event.target.value }))}
                placeholder="minimax/MiniMax-M2.7"
              />
            </LabeledField>
            <LabeledField label="Input / 1M USD">
              <Input
                type="number"
                min="0"
                step="0.001"
                value={String(draft.inputPerMillionUsd)}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    inputPerMillionUsd: Number(event.target.value || '0'),
                  }))
                }
              />
            </LabeledField>
            <LabeledField label="Input cache / 1M USD">
              <Input
                type="number"
                min="0"
                step="0.001"
                value={String(draft.inputCachePerMillionUsd)}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    inputCachePerMillionUsd: Number(event.target.value || '0'),
                  }))
                }
              />
            </LabeledField>
            <LabeledField label="Output / 1M USD">
              <Input
                type="number"
                min="0"
                step="0.001"
                value={String(draft.outputPerMillionUsd)}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    outputPerMillionUsd: Number(event.target.value || '0'),
                  }))
                }
              />
            </LabeledField>
          </div>

          {input.error ? <p className="text-sm text-rose-600">{input.error}</p> : null}

          <div className="flex gap-3">
            <Button
              type="button"
              disabled={input.pending || !draft.modelKey.trim()}
              onClick={() =>
                input.onSave({
                  modelKey: draft.modelKey.trim(),
                  inputPerMillionUsd: draft.inputPerMillionUsd,
                  inputCachePerMillionUsd: draft.inputCachePerMillionUsd,
                  outputPerMillionUsd: draft.outputPerMillionUsd,
                })
              }
            >
              Save model price
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Registered prices</h4>
          <div className="mt-4 space-y-3">
            {input.prices.map((price) => (
              <div key={price.modelKey} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="font-medium text-slate-950 break-all">{price.modelKey}</p>
                <dl className="mt-3 space-y-1 text-sm text-slate-600">
                  <div>
                    <dt className="inline font-medium text-slate-800">Input:</dt>{' '}
                    <dd className="inline">{price.inputPerMillionUsd}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-slate-800">Cache input:</dt>{' '}
                    <dd className="inline">{price.inputCachePerMillionUsd}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-slate-800">Output:</dt>{' '}
                    <dd className="inline">{price.outputPerMillionUsd}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-slate-800">Updated:</dt>{' '}
                    <dd className="inline">{formatDateTime(price.updatedAt)}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function LlmDefaultsCard(input: {
  defaults: SystemLlmDefaults | null;
  profiles: LlmProfile[];
  pending: boolean;
  error: string | null;
  onSave(input: UpdateSystemLlmDefaultsInput): void;
}) {
  const selectableProfiles = useMemo(
    () => input.profiles.filter((profile) => profile.isEnabled),
    [input.profiles],
  );
  const [draft, setDraft] = useState<UpdateSystemLlmDefaultsInput>({
    primaryProfileId: input.defaults?.primaryProfileId ?? selectableProfiles[0]?.profileId ?? '',
    omProfileId: input.defaults?.omProfileId ?? selectableProfiles[0]?.profileId ?? '',
    hiringRhProfileId: input.defaults?.hiringRhProfileId ?? selectableProfiles[0]?.profileId ?? '',
  });

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Hiring defaults</h3>
          <p className="mt-1 text-sm text-slate-500">
            These defaults are applied when a new agent is hired and when the hiring RH prompt is generated.
          </p>
        </div>
        {input.pending ? <LoaderCircle className="h-4 w-4 animate-spin text-slate-500" /> : null}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <LabeledField label="Primary model profile">
          <Select
            value={draft.primaryProfileId}
            onChange={(event) => setDraft((current) => ({ ...current, primaryProfileId: event.target.value }))}
          >
            {selectableProfiles.map((profile) => (
              <option key={profile.profileId} value={profile.profileId}>
                {formatProfileOption(profile)}
              </option>
            ))}
          </Select>
        </LabeledField>
        <LabeledField label="OM model profile">
          <Select
            value={draft.omProfileId}
            onChange={(event) => setDraft((current) => ({ ...current, omProfileId: event.target.value }))}
          >
            {selectableProfiles.map((profile) => (
              <option key={profile.profileId} value={profile.profileId}>
                {formatProfileOption(profile)}
              </option>
            ))}
          </Select>
        </LabeledField>
        <LabeledField label="Hiring RH model profile">
          <Select
            value={draft.hiringRhProfileId}
            onChange={(event) => setDraft((current) => ({ ...current, hiringRhProfileId: event.target.value }))}
          >
            {selectableProfiles.map((profile) => (
              <option key={profile.profileId} value={profile.profileId}>
                {formatProfileOption(profile)}
              </option>
            ))}
          </Select>
        </LabeledField>
      </div>

      {input.error ? <p className="mt-4 text-sm text-rose-600">{input.error}</p> : null}
      {!input.defaults ? (
        <p className="mt-4 text-sm text-amber-700">
          LLM defaults are not configured yet. Pick the profiles and save them.
        </p>
      ) : null}

      <div className="mt-5 flex gap-3">
        <Button
          type="button"
          disabled={
            input.pending ||
            !draft.primaryProfileId ||
            !draft.omProfileId ||
            !draft.hiringRhProfileId
          }
          onClick={() => input.onSave(draft)}
        >
          Save LLM defaults
        </Button>
      </div>
    </Card>
  );
}

function LlmProfileEditorCard(input: {
  profiles: LlmProfile[];
  pending: boolean;
  deletingProfileId: string | null;
  saveError: string | null;
  deleteError: string | null;
  onSave(input: UpsertLlmProfileInput): void;
  onDelete(profileId: string): void;
}) {
  const [selectedProfileId, setSelectedProfileId] = useState<string>('new');
  const selectedProfile = input.profiles.find((profile) => profile.profileId === selectedProfileId) ?? null;

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">LLM profiles</h3>
          <p className="mt-1 text-sm text-slate-500">
            Profiles are reusable model selections. Defaults point to one of these profiles.
          </p>
        </div>
        {input.pending ? <LoaderCircle className="h-4 w-4 animate-spin text-slate-500" /> : null}
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="space-y-4">
          <LabeledField label="Edit profile">
            <Select value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value)}>
              <option value="new">Create new profile</option>
              {input.profiles.map((profile) => (
              <option key={profile.profileId} value={profile.profileId}>
                  {formatProfileOption(profile)}
              </option>
            ))}
            </Select>
          </LabeledField>

          <LlmProfileForm
            key={`llm-profile-form-${selectedProfile?.profileId ?? 'new'}`}
            profile={selectedProfile}
            pending={input.pending}
            deletingProfileId={input.deletingProfileId}
            saveError={input.saveError}
            deleteError={input.deleteError}
            onSave={input.onSave}
            onDelete={input.onDelete}
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Registered profiles</h4>
          <div className="mt-4 space-y-3">
            {input.profiles.map((profile) => (
              <div key={profile.profileId} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-950">{profile.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{profile.profileId}</p>
                    <p className="mt-1 text-xs text-slate-500 break-all">{profile.modelKey}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {profile.isEnabled ? 'enabled' : 'disabled'}
                  </span>
                </div>
                <dl className="mt-3 space-y-1 text-sm text-slate-600">
                  <div>
                    <dt className="inline font-medium text-slate-800">Model key:</dt>{' '}
                    <dd className="inline break-all">{profile.modelKey}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-slate-800">Base URL:</dt>{' '}
                    <dd className="inline break-all">{profile.baseUrl ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-slate-800">Direct token:</dt>{' '}
                    <dd className="inline">configured</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-slate-800">Contract cost modifier:</dt>{' '}
                    <dd className="inline">{profile.contractCostMultiplier.toFixed(3)}x</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-slate-800">Updated:</dt>{' '}
                    <dd className="inline">{formatDateTime(profile.updatedAt)}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function LlmProfileForm(input: {
  profile: LlmProfile | null;
  pending: boolean;
  deletingProfileId: string | null;
  saveError: string | null;
  deleteError: string | null;
  onSave(input: UpsertLlmProfileInput): void;
  onDelete(profileId: string): void;
}) {
  const profile = input.profile;
  const [draft, setDraft] = useState<LlmProfileDraft>(buildLlmProfileDraft(input.profile));

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <LabeledField label="Profile name">
          <Input
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            placeholder="claude-haiku-om"
          />
        </LabeledField>
        <LabeledField label="Model key">
          <Input
            value={draft.modelKey}
            onChange={(event) => setDraft((current) => ({ ...current, modelKey: event.target.value }))}
            placeholder="account-oauth/openai-codex/gpt-5.4"
          />
        </LabeledField>
        <LabeledField label="Base URL">
          <Input
            value={draft.baseUrl}
            onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))}
            placeholder="https://api.minimax.io/anthropic/v1"
          />
        </LabeledField>
        <LabeledField label="Contract cost modifier">
          <Input
            type="number"
            min="0.001"
            step="0.001"
            value={String(draft.contractCostMultiplier)}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                contractCostMultiplier: Number(event.target.value || '1'),
              }))
            }
          />
        </LabeledField>
        <LabeledField label="API key">
          <Input
            value={draft.apiKey}
            onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))}
            placeholder="Required. OAuth profiles can use a placeholder value."
          />
        </LabeledField>
      </div>

      <label className="mt-4 flex items-center gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={draft.isEnabled}
          onChange={(event) => setDraft((current) => ({ ...current, isEnabled: event.target.checked }))}
        />
        Enable this LLM profile
      </label>

      {input.saveError ? <p className="mt-4 text-sm text-rose-600">{input.saveError}</p> : null}
      {input.deleteError ? <p className="mt-2 text-sm text-rose-600">{input.deleteError}</p> : null}

      <div className="mt-5 flex gap-3">
        <Button
          type="button"
          disabled={input.pending}
          onClick={() =>
            input.onSave({
              ...draft,
              name: draft.name.trim(),
              modelKey: draft.modelKey.trim(),
              baseUrl: draft.baseUrl.trim() ? draft.baseUrl.trim() : null,
              apiKey: draft.apiKey.trim(),
            })
          }
        >
          {profile ? 'Save profile' : 'Create profile'}
        </Button>
        {profile ? (
          <Button
            type="button"
            variant="secondary"
            disabled={input.deletingProfileId === profile.profileId}
            onClick={() => input.onDelete(profile.profileId)}
          >
            <Trash2 className="h-4 w-4" />
            Delete profile
          </Button>
        ) : null}
      </div>
    </>
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
            placeholder="Optional override. Leave empty to use Coolify wildcard domain."
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
                ...(draft.applicationsBaseDomain.trim()
                  ? { applicationsBaseDomain: draft.applicationsBaseDomain.trim() }
                  : {}),
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

function GitHubIntegrationCard(input: {
  integration: SystemIntegration | null;
  pending: boolean;
  deleting: boolean;
  error: string | null;
  onDelete(): void;
  onSave(input: Extract<UpsertSystemIntegrationInput, { providerType: 'github' }>): void;
}) {
  const initialDraft = getGitHubDraft(input.integration);
  const [draft, setDraft] = useState(initialDraft);

  return (
    <IntegrationCard
      title="GitHub"
      integration={input.integration}
      pending={input.pending}
      deleting={input.deleting}
      error={input.error}
      onDelete={input.onDelete}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <LabeledField label="Organization">
          <Input
            value={draft.organization}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                organization: event.target.value,
              }))
            }
            placeholder="alternative-down"
          />
        </LabeledField>
        <LabeledField label="App home URL">
          <Input
            value={draft.appHomeUrl}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                appHomeUrl: event.target.value,
              }))
            }
            placeholder="https://forge.alternativedown.com.br"
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
        Enable GitHub App provisioning
      </label>
      <div className="mt-5 flex gap-3">
        <Button
          type="button"
          disabled={input.pending}
          onClick={() =>
            input.onSave({
              providerType: 'github',
              isEnabled: draft.isEnabled,
              config: {
                organization: draft.organization,
                appHomeUrl: draft.appHomeUrl,
              },
            })
          }
        >
          Save GitHub
        </Button>
      </div>
    </IntegrationCard>
  );
}

function OauthSyncCard(input: {
  state: SystemOauthState;
  pendingProviderId: 'openai-codex' | 'anthropic' | 'all' | null;
  error: string | null;
  result: {
    state: SystemOauthState;
    results: Array<{
      providerId: 'openai-codex' | 'anthropic';
      synced: boolean;
      error?: string;
    }>;
  } | null;
  onSync(providerId: 'openai-codex' | 'anthropic' | 'all'): void;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-950">OAuth sync</h3>
          <p className="mt-1 text-sm text-slate-500">
            Log into Codex or Claude CLI inside the running container, then sync the credentials into Forge persistent
            storage.
          </p>
        </div>
        <Cable className="h-5 w-5 text-slate-500" />
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Persistent store: <span className="font-mono text-slate-900">{input.state.storePath}</span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {input.state.providers.map((provider) => (
          <div key={provider.providerId} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-slate-950">{provider.providerId}</h4>
                <p className="mt-1 text-xs text-slate-500">{provider.sourcePath}</p>
              </div>
              <Button
                onClick={() => input.onSync(provider.providerId)}
                disabled={input.pendingProviderId !== null}
              >
                {input.pendingProviderId === provider.providerId ? 'Syncing...' : 'Sync'}
              </Button>
            </div>

            <dl className="mt-4 space-y-2 text-sm text-slate-600">
              <div className="flex items-center justify-between gap-3">
                <dt>CLI source present</dt>
                <dd className="font-medium text-slate-900">{provider.sourcePresent ? 'yes' : 'no'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Persisted in Forge</dt>
                <dd className="font-medium text-slate-900">{provider.synced ? 'yes' : 'no'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Refresh token</dt>
                <dd className="font-medium text-slate-900">{provider.hasRefresh ? 'yes' : 'no'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Expires at</dt>
                <dd className="font-medium text-slate-900">
                  {provider.expiresAt ? formatDateTime(provider.expiresAt) : 'n/a'}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={() => input.onSync('all')} disabled={input.pendingProviderId !== null}>
          {input.pendingProviderId === 'all' ? 'Syncing all...' : 'Sync all'}
        </Button>
      </div>

      {input.error ? <p className="mt-4 text-sm text-rose-600">{input.error}</p> : null}

      {input.result ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <div className="font-medium text-slate-900">Last sync result</div>
          <ul className="mt-2 space-y-1">
            {input.result.results.map((result) => (
              <li key={result.providerId}>
                <span className="font-medium text-slate-900">{result.providerId}</span>: {result.synced ? 'synced' : 'failed'}
                {result.error ? ` - ${result.error}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
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
            {input.integration ? `Updated ${formatDateTime(input.integration.updatedAt)}` : 'Not configured yet'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {input.pending ? <LoaderCircle className="h-4 w-4 animate-spin text-slate-500" /> : null}
          {input.integration ? (
            <Button type="button" variant="secondary" onClick={input.onDelete} disabled={input.deleting}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-5">{input.children}</div>
      {input.error ? <p className="mt-4 text-sm text-rose-600">{input.error}</p> : null}
    </Card>
  );
}

function LabeledField(input: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2 text-sm text-slate-700">
      <span className="font-medium text-slate-800">{input.label}</span>
      {input.children}
    </label>
  );
}

function PanelLoading(input: { label: string }) {
  return (
    <Card className="flex items-center gap-3 p-6 text-sm text-slate-500">
      <LoaderCircle className="h-4 w-4 animate-spin" />
      {input.label}
    </Card>
  );
}

function PanelError(input: { message: string }) {
  return (
    <Card className="p-6 text-sm text-rose-600">
      {input.message}
    </Card>
  );
}

function getIntegrationError(
  providerType: UpsertSystemIntegrationInput['providerType'],
  upsertErrorMessage: string | undefined,
  deleteErrorMessage: string | undefined,
  upsertVariables: UpsertSystemIntegrationInput | undefined,
  deleteVariables: 'migadu' | 'coolify' | 'github' | undefined,
) {
  if (upsertVariables?.providerType === providerType && upsertErrorMessage) {
    return upsertErrorMessage;
  }

  if (deleteVariables === providerType && deleteErrorMessage) {
    return deleteErrorMessage;
  }

  return null;
}

function getMigaduDraft(integration: SystemIntegration | null): MigaduDraft {
  if (!integration || integration.providerType !== 'migadu') {
    return {
      isEnabled: true,
      apiUser: '',
      apiKey: '',
    };
  }

  return {
    isEnabled: integration.isEnabled,
    apiUser: integration.config?.apiUser ?? '',
    apiKey: integration.config?.apiKey ?? '',
  };
}

function getCoolifyDraft(integration: SystemIntegration | null): CoolifyDraft {
  if (!integration || integration.providerType !== 'coolify') {
    return {
      isEnabled: true,
      baseUrl: '',
      adminToken: '',
      applicationsBaseDomain: '',
    };
  }

  return {
    isEnabled: integration.isEnabled,
    baseUrl: integration.config?.baseUrl ?? '',
    adminToken: integration.config?.adminToken ?? '',
    applicationsBaseDomain: integration.config?.applicationsBaseDomain ?? '',
  };
}

function getGitHubDraft(integration: SystemIntegration | null): GitHubDraft {
  if (!integration || integration.providerType !== 'github') {
    return {
      isEnabled: true,
      organization: '',
      appHomeUrl: '',
    };
  }

  return {
    isEnabled: integration.isEnabled,
    organization: integration.config?.organization ?? '',
    appHomeUrl: integration.config?.appHomeUrl ?? '',
  };
}

function buildLlmProfileDraft(profile: LlmProfile | null): LlmProfileDraft {
  if (!profile) {
    return {
      modelKey: '',
      name: '',
      baseUrl: '',
      apiKey: '',
      contractCostMultiplier: 1,
      isEnabled: true,
    };
  }

  return {
    profileId: profile.profileId,
    name: profile.name,
    modelKey: profile.modelKey,
    baseUrl: profile.baseUrl ?? '',
    apiKey: profile.apiKey,
    contractCostMultiplier: profile.contractCostMultiplier,
    isEnabled: profile.isEnabled,
  };
}

function buildLlmModelPriceDraft(price: {
  modelKey: string;
  inputPerMillionUsd: number;
  inputCachePerMillionUsd: number;
  outputPerMillionUsd: number;
} | null): LlmModelPriceDraft {
  if (!price) {
    return {
      modelKey: '',
      inputPerMillionUsd: 0,
      inputCachePerMillionUsd: 0,
      outputPerMillionUsd: 0,
    };
  }

  return {
    modelKey: price.modelKey,
    inputPerMillionUsd: price.inputPerMillionUsd,
    inputCachePerMillionUsd: price.inputCachePerMillionUsd,
    outputPerMillionUsd: price.outputPerMillionUsd,
  };
}

function formatProfileOption(profile: LlmProfile) {
  return `${profile.name} · ${profile.modelKey}`;
}
