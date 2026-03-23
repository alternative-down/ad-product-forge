import { type ReactNode, useMemo, useState } from 'react';
import { Cable, LoaderCircle, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';

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
import { PageHeader } from '../../components/layout/page-header';
import { SectionNav, WorkspaceCanvas } from '../../components/layout/section-nav';
import { SegmentedTabs } from '../../components/ui/segmented-tabs';

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
  return <SystemWorkspacePage mode="directory" />;
}

export function SystemDetailPage(input: {
  section: 'company' | 'llm' | 'auth' | 'integrations' | 'migrations';
  llmView?: 'defaults' | 'profiles' | 'prices';
  integrationView?: 'migadu' | 'coolify' | 'github';
}) {
  return <SystemWorkspacePage mode="detail" {...input} />;
}

function SystemWorkspacePage(input: {
  mode: 'directory' | 'detail';
  section?: 'company' | 'llm' | 'auth' | 'integrations' | 'migrations';
  llmView?: 'defaults' | 'profiles' | 'prices';
  integrationView?: 'migadu' | 'coolify' | 'github';
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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
  const selectedTab = input.section ?? 'company';
  const selectedLlmView = input.llmView ?? 'defaults';
  const selectedIntegrationView = input.integrationView ?? 'migadu';
  const enabledProfilesCount = systemLlm.profiles.filter((profile) => profile.isEnabled).length;
  const syncedOauthProviders = oauthState.providers.filter((provider) => provider.synced).length;
  const appliedMigrationsCount = migrations.entries.filter((entry) => entry.applied).length;
  const pendingMigrationsCount = migrations.entries.filter((entry) => !entry.applied).length;
  const selectedIntegration =
    selectedIntegrationView === 'coolify'
      ? coolifyIntegration
      : selectedIntegrationView === 'github'
        ? githubIntegration
        : migaduIntegration;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="System configuration"
        description="Shared company context, model wiring, OAuth state, integrations, and migration visibility. Open one system area at a time."
        actions={
          input.mode === 'detail' ? (
            <Link
              to="/system"
              className="inline-flex h-11 items-center justify-center rounded-md border border-[color:var(--panel-border-strong)] bg-[color:var(--panel-strong)] px-5 text-sm font-semibold text-[color:var(--ink)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
            >
              Back to system
            </Link>
          ) : null
        }
      />

      {input.mode === 'directory' ? (
        <WorkspaceCanvas
          title="System areas"
          description="Open one system concern at a time: company context, model wiring, OAuth, integrations, or migrations."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <SystemEntryLink
              to="/system/company"
              title="Company"
              detail="Global prompt context"
              metric={systemSettings.companyName || 'No company name'}
            />
            <SystemEntryLink
              to="/system/llm/defaults"
              title="LLM defaults"
              detail={`${systemLlm.profiles.length} profiles configured`}
              metric={`${enabledProfilesCount} enabled`}
            />
            <SystemEntryLink
              to="/system/llm/profiles"
              title="LLM profiles"
              detail="Runtime endpoints and API keys"
              metric={`${systemLlm.profiles.length} registered`}
            />
            <SystemEntryLink
              to="/system/llm/prices"
              title="LLM pricing"
              detail={`${systemLlm.prices.length} price rows`}
              metric={`${systemLlm.prices.length} tracked`}
            />
            <SystemEntryLink
              to="/system/oauth"
              title="OAuth"
              detail={`${Object.keys(oauthState).length} providers`}
              metric={`${syncedOauthProviders} synced`}
            />
            <SystemEntryLink
              to="/system/integrations/migadu"
              title="Integrations"
              detail={`${integrations.filter((integration) => integration.isEnabled).length} enabled`}
              metric={`${integrations.length} configured`}
            />
            <SystemEntryLink
              to="/system/migrations"
              title="Migrations"
              detail={`${migrations.entries.filter((entry) => !entry.applied).length} pending`}
              metric={`${appliedMigrationsCount} applied`}
            />
          </div>
        </WorkspaceCanvas>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <SectionNav
            title="System areas"
            value={selectedTab}
            items={[
              { value: 'company', label: 'Company', detail: 'global prompt context' },
              { value: 'llm', label: 'LLM', detail: `${systemLlm.profiles.length} profiles · ${systemLlm.prices.length} prices` },
              { value: 'auth', label: 'OAuth', detail: `${Object.keys(oauthState).length} providers` },
              { value: 'integrations', label: 'Integrations', detail: `${integrations.filter((integration) => integration.isEnabled).length} enabled` },
              { value: 'migrations', label: 'Migrations', detail: `${migrations.entries.filter((entry) => !entry.applied).length} pending` },
            ]}
            onChange={(section) =>
              void navigate(buildSystemLocation({
                section,
                llmView: selectedLlmView,
                integrationView: selectedIntegrationView,
              }))
            }
          />

          <div className="space-y-6">
          {selectedTab === 'company' ? (
            <WorkspaceCanvas
              title="Company context"
              description="Shared identity and operating context injected into every loaded agent prompt."
            >
              <div className="max-w-4xl">
                <SystemSettingsCard
                  key={`system-settings-${systemSettings.updatedAt ?? 'unset'}`}
                  settings={systemSettings}
                  pending={upsertSystemSettingsMutation.isPending}
                  error={upsertSystemSettingsMutation.error?.message ?? null}
                  onSave={(input) => upsertSystemSettingsMutation.mutate(input)}
                />
              </div>
            </WorkspaceCanvas>
          ) : null}

          {selectedTab === 'llm' ? (
            <div className="space-y-6">
              <WorkspaceCanvas
                title="LLM status"
                description="Global model inventory, defaults, and pricing coverage."
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <ReadOnlyField label="Profiles" value={String(systemLlm.profiles.length)} />
                  <ReadOnlyField label="Enabled profiles" value={String(enabledProfilesCount)} />
                  <ReadOnlyField label="Price rows" value={String(systemLlm.prices.length)} />
                  <ReadOnlyField
                    label="Defaults configured"
                    value={systemLlm.defaults ? 'yes' : 'no'}
                  />
                </div>
              </WorkspaceCanvas>

              <SegmentedTabs
                value={selectedLlmView}
                items={[
                  { value: 'defaults', label: 'Defaults', description: 'system execution profiles' },
                  { value: 'profiles', label: 'Profiles', description: 'runtime endpoints and credentials' },
                  { value: 'prices', label: 'Prices', description: 'contract accounting rows' },
                ]}
                onChange={(llmView) =>
                  void navigate(buildSystemLocation({
                    section: 'llm',
                    llmView,
                    integrationView: selectedIntegrationView,
                  }))
                }
              />

              {selectedLlmView === 'defaults' ? (
                <WorkspaceCanvas
                  title="LLM defaults"
                  description="Pick the primary execution profile, OM profile, and hiring RH profile."
                >
                  <div className="max-w-5xl">
                    <LlmDefaultsCard
                      key={`llm-defaults-${systemLlm.defaults?.updatedAt ?? 'unset'}`}
                      defaults={systemLlm.defaults}
                      profiles={systemLlm.profiles}
                      pending={updateLlmDefaultsMutation.isPending}
                      error={updateLlmDefaultsMutation.error?.message ?? null}
                      onSave={(input) => updateLlmDefaultsMutation.mutate(input)}
                    />
                  </div>
                </WorkspaceCanvas>
              ) : null}
              {selectedLlmView === 'profiles' ? (
                <WorkspaceCanvas
                  title="LLM profiles"
                  description="Profiles define model key, base URL, API key, and contract multiplier."
                >
                  <LlmProfileEditorCard
                    profiles={systemLlm.profiles}
                    pending={upsertLlmProfileMutation.isPending}
                    deletingProfileId={deleteLlmProfileMutation.isPending ? deleteLlmProfileMutation.variables ?? null : null}
                    saveError={upsertLlmProfileMutation.error?.message ?? null}
                    deleteError={deleteLlmProfileMutation.error?.message ?? null}
                    onSave={(input) => upsertLlmProfileMutation.mutate(input)}
                    onDelete={(profileId) => deleteLlmProfileMutation.mutate(profileId)}
                  />
                </WorkspaceCanvas>
              ) : null}
              {selectedLlmView === 'prices' ? (
                <WorkspaceCanvas
                  title="LLM pricing"
                  description="Price rows are used by hiring, contracts, and execution accounting."
                >
                  <LlmPricingCard
                    prices={systemLlm.prices}
                    pending={upsertLlmModelPriceMutation.isPending}
                    error={upsertLlmModelPriceMutation.error?.message ?? null}
                    onSave={(input) => upsertLlmModelPriceMutation.mutate(input)}
                  />
                </WorkspaceCanvas>
              ) : null}
            </div>
          ) : null}

          {selectedTab === 'auth' ? (
            <div className="space-y-6">
              <WorkspaceCanvas
                title="OAuth status"
                description="CLI account availability and persisted sync state."
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <ReadOnlyField label="Providers" value={String(oauthState.providers.length)} />
                  <ReadOnlyField label="Synced" value={String(syncedOauthProviders)} />
                  <ReadOnlyField
                    label="Unsynced"
                    value={String(oauthState.providers.length - syncedOauthProviders)}
                  />
                  <ReadOnlyField label="Store path" value={oauthState.storePath} />
                </div>
              </WorkspaceCanvas>

              <WorkspaceCanvas
                title="OAuth sync"
                description="Provider-side account sync used by the custom gateway and synced integrations."
              >
                <OauthSyncCard
                  state={oauthState}
                  pendingProviderId={syncOauthMutation.isPending ? syncOauthMutation.variables : null}
                  error={syncOauthMutation.error?.message ?? null}
                  result={syncOauthMutation.data ?? null}
                  onSync={(providerId) => syncOauthMutation.mutate(providerId)}
                />
              </WorkspaceCanvas>
            </div>
          ) : null}

          {selectedTab === 'migrations' ? (
            <div className="space-y-6">
              <WorkspaceCanvas
                title="Migration status"
                description="Applied versus pending journal entries for the application database."
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <ReadOnlyField label="Entries" value={String(migrations.entries.length)} />
                  <ReadOnlyField label="Applied" value={String(appliedMigrationsCount)} />
                  <ReadOnlyField label="Pending" value={String(pendingMigrationsCount)} />
                  <ReadOnlyField
                    label="Latest applied row"
                    value={migrations.applied.at(-1)?.id != null ? String(migrations.applied.at(-1)?.id) : '—'}
                  />
                </div>
              </WorkspaceCanvas>

              <WorkspaceCanvas
                title="Application migrations"
                description="Repository journal entries matched against __drizzle_migrations."
              >
                <MigrationStatusCard migrations={migrations} />
              </WorkspaceCanvas>
            </div>
          ) : null}

          {selectedTab === 'integrations' ? (
            <div className="space-y-6">
              <WorkspaceCanvas
                title="Integration status"
                description="Current provisioning and automation endpoints configured for the platform."
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <ReadOnlyField
                    label="Enabled integrations"
                    value={String(integrations.filter((integration) => integration.isEnabled).length)}
                  />
                  <ReadOnlyField label="Selected" value={selectedIntegrationView} />
                  <ReadOnlyField
                    label="Configured"
                    value={selectedIntegration ? 'yes' : 'no'}
                  />
                  <ReadOnlyField
                    label="Enabled"
                    value={selectedIntegration?.isEnabled ? 'yes' : 'no'}
                  />
                </div>
              </WorkspaceCanvas>

              <SegmentedTabs
                value={selectedIntegrationView}
                items={[
                  { value: 'migadu', label: 'Migadu', description: 'mailbox provisioning' },
                  { value: 'coolify', label: 'Coolify', description: 'deployment automation' },
                  { value: 'github', label: 'GitHub', description: 'app provisioning' },
                ]}
                onChange={(integrationView) =>
                  void navigate(buildSystemLocation({
                    section: 'integrations',
                    llmView: selectedLlmView,
                    integrationView,
                  }))
                }
              />

              {selectedIntegrationView === 'migadu' ? (
                <WorkspaceCanvas title="Migadu integration" description="Controls mailbox provisioning for agents.">
                  <div className="max-w-5xl">
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
                  </div>
                </WorkspaceCanvas>
              ) : null}
              {selectedIntegrationView === 'coolify' ? (
                <WorkspaceCanvas title="Coolify integration" description="Controls deployment automation and generated application domains.">
                  <div className="max-w-5xl">
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
                  </div>
                </WorkspaceCanvas>
              ) : null}
              {selectedIntegrationView === 'github' ? (
                <WorkspaceCanvas title="GitHub integration" description="Controls GitHub App provisioning for internal agents.">
                  <div className="max-w-5xl">
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
                </WorkspaceCanvas>
              ) : null}
            </div>
              ) : null}
            </div>
          </div>
        )}
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

function SystemEntryLink(input: {
  to:
    | '/system/company'
    | '/system/llm/defaults'
    | '/system/llm/profiles'
    | '/system/llm/prices'
    | '/system/oauth'
    | '/system/integrations/migadu'
    | '/system/migrations';
  title: string;
  detail: string;
  metric: string;
}) {
  return (
    <Link
      to={input.to}
      className="rounded-md border border-[color:var(--panel-border)] bg-[color:var(--panel-strong)] px-5 py-5 transition hover:border-[color:var(--panel-border-strong)] hover:bg-[color:var(--panel)]"
    >
      <div className="text-lg font-semibold text-[color:var(--ink)]">{input.title}</div>
      <div className="mt-2 text-sm text-[color:var(--muted)]">{input.detail}</div>
      <div className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
        {input.metric}
      </div>
    </Link>
  );
}

function buildSystemLocation(input: {
  section: 'company' | 'llm' | 'auth' | 'integrations' | 'migrations';
  llmView?: 'defaults' | 'profiles' | 'prices';
  integrationView?: 'migadu' | 'coolify' | 'github';
}):
  | { to: '/system/company' }
  | { to: '/system/llm/defaults' }
  | { to: '/system/llm/profiles' }
  | { to: '/system/llm/prices' }
  | { to: '/system/oauth' }
  | { to: '/system/integrations/migadu' }
  | { to: '/system/integrations/coolify' }
  | { to: '/system/integrations/github' }
  | { to: '/system/migrations' } {
  if (input.section === 'company') {
    return { to: '/system/company' };
  }

  if (input.section === 'llm') {
    if (input.llmView === 'profiles') {
      return { to: '/system/llm/profiles' };
    }

    if (input.llmView === 'prices') {
      return { to: '/system/llm/prices' };
    }

    return { to: '/system/llm/defaults' };
  }

  if (input.section === 'auth') {
    return { to: '/system/oauth' };
  }

  if (input.section === 'integrations') {
    if (input.integrationView === 'coolify') {
      return { to: '/system/integrations/coolify' };
    }

    if (input.integrationView === 'github') {
      return { to: '/system/integrations/github' };
    }

    return { to: '/system/integrations/migadu' };
  }

  return { to: '/system/migrations' };
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
    <div className="space-y-6">
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

        <div className="mt-5 space-y-4">
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
      </Card>

      <Card className="p-6">
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
      </Card>
    </div>
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
    <div className="space-y-6">
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

        <div className="mt-5 space-y-4">
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
      </Card>

      <Card className="p-6">
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
                <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
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
      </Card>
    </div>
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

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Persistent store: <span className="font-mono text-slate-900">{input.state.storePath}</span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {input.state.providers.map((provider) => (
          <div key={provider.providerId} className="rounded-lg border border-slate-200 p-4">
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
        <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
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

function ReadOnlyField(input: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted-strong)]">
        {input.label}
      </div>
      <div className="mt-2 break-all text-sm font-semibold text-[color:var(--ink)]">{input.value}</div>
    </div>
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
