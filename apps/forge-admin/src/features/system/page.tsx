import { type ReactNode, useMemo, useState } from 'react';
import { Bot, Cable, LoaderCircle, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  deleteLlmProfile,
  deleteSystemIntegration,
  getSystemLlm,
  listSystemIntegrations,
  updateSystemLlmDefaults,
  upsertLlmProfile,
  upsertSystemIntegration,
  type LlmProfile,
  type SystemIntegration,
  type SystemLlmDefaults,
  type SystemLlmResponse,
  type UpdateSystemLlmDefaultsInput,
  type UpsertLlmProfileInput,
  type UpsertSystemIntegrationInput,
} from '../../lib/api';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Select } from '../../components/ui/select';
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

type GitHubDraft = {
  isEnabled: boolean;
  organization: string;
  appHomeUrl: string;
};

type LlmProfileDraft = {
  profileId?: string;
  slug: string;
  label: string;
  providerType: 'openai-codex' | 'claude-max';
  modelId: string;
  isEnabled: boolean;
};

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

  if (integrationsQuery.isLoading || llmQuery.isLoading) {
    return <PanelLoading label="Loading system configuration" />;
  }

  if (integrationsQuery.isError) {
    return <PanelError message={integrationsQuery.error.message} />;
  }

  if (llmQuery.isError) {
    return <PanelError message={llmQuery.error.message} />;
  }

  const integrations = integrationsQuery.data ?? [];
  const migaduIntegration = integrations.find((integration) => integration.providerType === 'migadu') ?? null;
  const coolifyIntegration = integrations.find((integration) => integration.providerType === 'coolify') ?? null;
  const githubIntegration = integrations.find((integration) => integration.providerType === 'github') ?? null;
  const systemLlm = llmQuery.data!;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">System configuration</h2>
            <p className="mt-1 text-sm text-slate-500">
              Global integrations, LLM profiles, and hiring defaults for the Forge runtime.
            </p>
          </div>
          <Cable className="h-5 w-5 text-slate-500" />
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">LLM configuration</h2>
            <p className="mt-1 text-sm text-slate-500">
              Profiles define provider plus model pairs. Defaults drive internal hiring and OM selection.
            </p>
          </div>
          <Bot className="h-5 w-5 text-slate-500" />
        </div>
      </Card>

      <LlmDefaultsCard
        key={`llm-defaults-${systemLlm.defaults.updatedAt}`}
        defaults={systemLlm.defaults}
        profiles={systemLlm.profiles}
        pending={updateLlmDefaultsMutation.isPending}
        error={updateLlmDefaultsMutation.error?.message ?? null}
        onSave={(input) => updateLlmDefaultsMutation.mutate(input)}
      />

      <LlmProfileEditorCard
        supportedProviders={systemLlm.supportedProviders}
        profiles={systemLlm.profiles}
        pending={upsertLlmProfileMutation.isPending}
        deletingProfileId={deleteLlmProfileMutation.isPending ? deleteLlmProfileMutation.variables ?? null : null}
        saveError={upsertLlmProfileMutation.error?.message ?? null}
        deleteError={deleteLlmProfileMutation.error?.message ?? null}
        onSave={(input) => upsertLlmProfileMutation.mutate(input)}
        onDelete={(profileId) => deleteLlmProfileMutation.mutate(profileId)}
      />

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

function LlmDefaultsCard(input: {
  defaults: SystemLlmDefaults;
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
    primaryProfileId: input.defaults.primaryProfileId,
    omProfileId: input.defaults.omProfileId,
    hiringRhProfileId: input.defaults.hiringRhProfileId,
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
                {profile.label}
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
                {profile.label}
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
                {profile.label}
              </option>
            ))}
          </Select>
        </LabeledField>
      </div>

      {input.error ? <p className="mt-4 text-sm text-rose-600">{input.error}</p> : null}

      <div className="mt-5 flex gap-3">
        <Button type="button" disabled={input.pending} onClick={() => input.onSave(draft)}>
          Save LLM defaults
        </Button>
      </div>
    </Card>
  );
}

function LlmProfileEditorCard(input: {
  supportedProviders: SystemLlmResponse['supportedProviders'];
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
                  {profile.label}
                </option>
              ))}
            </Select>
          </LabeledField>

          <LlmProfileForm
            key={`llm-profile-form-${selectedProfile?.profileId ?? 'new'}`}
            profile={selectedProfile}
            supportedProviders={input.supportedProviders}
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
                    <p className="font-medium text-slate-950">{profile.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{profile.slug}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {profile.isEnabled ? 'enabled' : 'disabled'}
                  </span>
                </div>
                <dl className="mt-3 space-y-1 text-sm text-slate-600">
                  <div>
                    <dt className="inline font-medium text-slate-800">Provider:</dt>{' '}
                    <dd className="inline">{profile.providerType}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-slate-800">Model:</dt>{' '}
                    <dd className="inline">{profile.modelId}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-slate-800">Model key:</dt>{' '}
                    <dd className="inline break-all">{profile.modelKey}</dd>
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
  supportedProviders: SystemLlmResponse['supportedProviders'];
  pending: boolean;
  deletingProfileId: string | null;
  saveError: string | null;
  deleteError: string | null;
  onSave(input: UpsertLlmProfileInput): void;
  onDelete(profileId: string): void;
}) {
  const [draft, setDraft] = useState<LlmProfileDraft>(buildLlmProfileDraft(input.profile, input.supportedProviders));
  const availableModels = getSupportedModelIds(input.supportedProviders, draft.providerType);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <LabeledField label="Slug">
          <Input
            value={draft.slug}
            onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value }))}
            placeholder="openai-codex-gpt-5-4-primary"
          />
        </LabeledField>
        <LabeledField label="Label">
          <Input
            value={draft.label}
            onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
            placeholder="OpenAI Codex GPT-5.4 Primary"
          />
        </LabeledField>
        <LabeledField label="Provider">
          <Select
            value={draft.providerType}
            onChange={(event) => {
              const nextProviderType = event.target.value as LlmProfileDraft['providerType'];
              const nextModels = getSupportedModelIds(input.supportedProviders, nextProviderType);
              setDraft((current) => ({
                ...current,
                providerType: nextProviderType,
                modelId: nextModels[0] ?? '',
              }));
            }}
          >
            {input.supportedProviders.map((provider) => (
              <option key={provider.providerType} value={provider.providerType}>
                {provider.label}
              </option>
            ))}
          </Select>
        </LabeledField>
        <LabeledField label="Model">
          <Select
            value={draft.modelId}
            onChange={(event) => setDraft((current) => ({ ...current, modelId: event.target.value }))}
          >
            {availableModels.map((modelId) => (
              <option key={modelId} value={modelId}>
                {modelId}
              </option>
            ))}
          </Select>
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
        <Button type="button" disabled={input.pending} onClick={() => input.onSave(draft)}>
          {input.profile ? 'Save profile' : 'Create profile'}
        </Button>
        {input.profile ? (
          <Button
            type="button"
            variant="secondary"
            disabled={input.deletingProfileId === input.profile.profileId}
            onClick={() => input.onDelete(input.profile!.profileId)}
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
    apiUser: integration.config.apiUser,
    apiKey: integration.config.apiKey,
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
    baseUrl: integration.config.baseUrl,
    adminToken: integration.config.adminToken,
    applicationsBaseDomain: integration.config.applicationsBaseDomain ?? '',
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
    organization: integration.config.organization,
    appHomeUrl: integration.config.appHomeUrl,
  };
}

function buildLlmProfileDraft(
  profile: LlmProfile | null,
  supportedProviders: SystemLlmResponse['supportedProviders'],
): LlmProfileDraft {
  if (!profile) {
    return {
      slug: '',
      label: '',
      providerType: supportedProviders[0]?.providerType ?? 'openai-codex',
      modelId: supportedProviders[0]?.modelIds[0] ?? '',
      isEnabled: true,
    };
  }

  return {
    profileId: profile.profileId,
    slug: profile.slug,
    label: profile.label,
    providerType: profile.providerType,
    modelId: profile.modelId,
    isEnabled: profile.isEnabled,
  };
}

function getSupportedModelIds(
  supportedProviders: SystemLlmResponse['supportedProviders'],
  providerType: LlmProfileDraft['providerType'],
) {
  return supportedProviders.find((provider) => provider.providerType === providerType)?.modelIds ?? [];
}
