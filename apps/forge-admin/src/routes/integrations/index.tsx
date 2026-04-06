import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import {
  AdminLoadingState,
  PageHeader,
} from '@/components/admin';
import {
  getSystemLlm,
  getSystemOauth,
  syncSystemOauth,
  updateLlmDefaults,
  upsertLlmProfile,
  type LlmProfile,
  type UpsertLlmProfileInput,
} from '@/lib/admin-api';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';

import { LlmProfileDialog } from './-llm-profile-form';
import { OauthSection } from './-oauth-section';
import { ProfileDefaultsSection } from './-profile-defaults-section';
import { ProfilesSection } from './-profiles-section';

export const Route = createFileRoute('/integrations/')({
  component: IntegrationsProfilesRoute,
});

function createEmptyProfileForm(): UpsertLlmProfileInput {
  return {
    name: '',
    modelKey: '',
    baseUrl: '',
    apiKey: '',
    contractCostMultiplier: 1,
    isEnabled: true,
  };
}

function createProfileForm(profile: LlmProfile): UpsertLlmProfileInput {
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

function IntegrationsProfilesRoute() {
  const queryClient = useQueryClient();
  const llmQuery = useQuery({
    queryKey: ['admin', 'system-llm'],
    queryFn: getSystemLlm,
  });
  const oauthQuery = useQuery({
    queryKey: ['admin', 'system-oauth'],
    queryFn: getSystemOauth,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive'>('active');
  const [profileForm, setProfileForm] = useState<UpsertLlmProfileInput>(createEmptyProfileForm);
  const [defaultsDraft, setDefaultsDraft] = useState<{
    primaryProfileId: string;
    omProfileId: string;
    hiringRhProfileId: string;
  } | null>(null);
  const mutation = useMutation({
    mutationFn: upsertLlmProfile,
    onMutate: (input) => startAdminAction(input.profileId ? 'Salvando perfil...' : 'Criando perfil...'),
    onSuccess: async (_data, input, context) => {
      succeedAdminAction(context, input.profileId ? 'Perfil atualizado.' : 'Perfil criado.');
      setDialogOpen(false);
      setProfileForm(createEmptyProfileForm());
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-llm'] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const statusMutation = useMutation({
    mutationFn: upsertLlmProfile,
    onMutate: () => startAdminAction('Atualizando status do perfil...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Status do perfil atualizado.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-llm'] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const defaultsMutation = useMutation({
    mutationFn: updateLlmDefaults,
    onMutate: () => startAdminAction('Salvando perfis padrão...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Perfis padrão atualizados.');
      setDefaultsDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-llm'] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const oauthMutation = useMutation({
    mutationFn: syncSystemOauth,
    onMutate: () => startAdminAction('Sincronizando OAuth...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'OAuth sincronizado.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-oauth'] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const profiles = useMemo(
    () => [...(llmQuery.data?.profiles ?? [])].sort((left, right) => left.name.localeCompare(right.name)),
    [llmQuery.data?.profiles],
  );
  const filteredProfiles = useMemo(
    () => profiles.filter((profile) => profile.isEnabled === (statusFilter === 'active')),
    [profiles, statusFilter],
  );
  const enabledProfiles = useMemo(
    () => profiles.filter((profile) => profile.isEnabled),
    [profiles],
  );
  const modelKeys = useMemo(
    () =>
      [...new Set((llmQuery.data?.prices ?? []).map((price) => price.modelKey))].sort((left, right) =>
        left.localeCompare(right),
      ),
    [llmQuery.data?.prices],
  );
  const primaryProfileId = defaultsDraft?.primaryProfileId ?? llmQuery.data?.defaults?.primaryProfileId ?? '';
  const omProfileId = defaultsDraft?.omProfileId ?? llmQuery.data?.defaults?.omProfileId ?? '';
  const hiringRhProfileId = defaultsDraft?.hiringRhProfileId ?? llmQuery.data?.defaults?.hiringRhProfileId ?? '';
  const primaryProfileName = enabledProfiles.find((profile) => profile.profileId === primaryProfileId)?.name;
  const omProfileName = enabledProfiles.find((profile) => profile.profileId === omProfileId)?.name;
  const hiringRhProfileName = enabledProfiles.find((profile) => profile.profileId === hiringRhProfileId)?.name;

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {llmQuery.isLoading && !llmQuery.data ? <AdminLoadingState label="Carregando perfis..." /> : null}
      <PageHeader title="Perfis" />

      <ProfileDefaultsSection
        enabledProfiles={enabledProfiles}
        primaryProfileId={primaryProfileId}
        omProfileId={omProfileId}
        hiringRhProfileId={hiringRhProfileId}
        primaryProfileName={primaryProfileName}
        omProfileName={omProfileName}
        hiringRhProfileName={hiringRhProfileName}
        loading={llmQuery.isLoading}
        pending={defaultsMutation.isPending}
        errorMessage={defaultsMutation.error?.message ?? llmQuery.error?.message}
        onPrimaryProfileChange={(value) =>
          setDefaultsDraft((current) => ({
            primaryProfileId: value,
            omProfileId: current?.omProfileId ?? llmQuery.data?.defaults?.omProfileId ?? '',
            hiringRhProfileId: current?.hiringRhProfileId ?? llmQuery.data?.defaults?.hiringRhProfileId ?? '',
          }))
        }
        onOmProfileChange={(value) =>
          setDefaultsDraft((current) => ({
            primaryProfileId: current?.primaryProfileId ?? llmQuery.data?.defaults?.primaryProfileId ?? '',
            omProfileId: value,
            hiringRhProfileId: current?.hiringRhProfileId ?? llmQuery.data?.defaults?.hiringRhProfileId ?? '',
          }))
        }
        onHiringRhProfileChange={(value) =>
          setDefaultsDraft((current) => ({
            primaryProfileId: current?.primaryProfileId ?? llmQuery.data?.defaults?.primaryProfileId ?? '',
            omProfileId: current?.omProfileId ?? llmQuery.data?.defaults?.omProfileId ?? '',
            hiringRhProfileId: value,
          }))
        }
        onSubmit={() =>
          defaultsMutation.mutate({
            primaryProfileId,
            omProfileId,
            hiringRhProfileId,
          })
        }
      />

      <OauthSection
        providers={oauthQuery.data?.providers ?? []}
        pending={oauthMutation.isPending}
        errorMessage={oauthMutation.error?.message ?? oauthQuery.error?.message}
        onSync={(providerId) => oauthMutation.mutate(providerId)}
      />

      <ProfilesSection
        statusFilter={statusFilter}
        profiles={filteredProfiles}
        pending={statusMutation.isPending}
        createProfileForm={createProfileForm}
        onStatusFilterChange={setStatusFilter}
        onCreate={() => {
          setProfileForm(createEmptyProfileForm());
          setDialogOpen(true);
        }}
        onEdit={(profile) => {
          setProfileForm(createProfileForm(profile));
          setDialogOpen(true);
        }}
        onToggle={(profile) =>
          statusMutation.mutate({
            ...createProfileForm(profile),
            isEnabled: !profile.isEnabled,
          })
        }
      />

      <LlmProfileDialog
        open={dialogOpen}
        pending={mutation.isPending}
        profileForm={profileForm}
        modelKeys={modelKeys}
        errorMessage={mutation.error?.message ?? llmQuery.error?.message}
        onOpenChange={setDialogOpen}
        onProfileFormChange={setProfileForm}
        onSubmit={() =>
          mutation.mutate({
            ...profileForm,
            name: profileForm.name.trim(),
            modelKey: profileForm.modelKey.trim(),
            baseUrl: profileForm.baseUrl?.trim() || null,
            apiKey: profileForm.apiKey.trim(),
          })
        }
      />
    </div>
  );
}
