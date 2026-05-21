import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AdminLoadingState } from '@/components/admin/./system/admin-loading-state';
import {
  getSystemLlm,
  getSystemSettings,
  updateLlmDefaults,
  upsertSystemSettings,
} from '@/lib/admin-api/index';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';
import type { LlmProfile } from '@/lib/admin-api/index';

import { CompanySettingsSection } from './company-settings-section';
import { OperationsSettingsSection } from './operations-settings-section';
import { ProfileDefaultsSection } from '@/components/integrations/profile-defaults-section';
import { RuntimeSettingsSection } from './runtime-settings-section';
import {
  fromRuntimeDraft,
  toOperationsDraft,
  toRuntimeDraft,
  type CompanyDraft,
  type DefaultsDraft,
  type OperationsDraft,
  type RuntimeDraft,
  type SettingsMutation,
  type SettingsQuery,
} from './settings-types';

export const Route = createFileRoute('/settings/')({
  component: SettingsGeneralRoute,
});

function SettingsGeneralRoute() {
  const queryClient = useQueryClient();

  const settingsQuery: SettingsQuery = useQuery({
    queryKey: ['admin', 'system-settings'],
    queryFn: getSystemSettings,
  });

  const llmQuery = useQuery({
    queryKey: ['admin', 'system-llm'],
    queryFn: getSystemLlm,
  });

  // ── Draft state ────────────────────────────────────────────────

  const [companyDraft, setCompanyDraft] = useState<CompanyDraft | null>(null);
  const [operationsDraft, setOperationsDraft] = useState<OperationsDraft | null>(null);
  const [runtimeDraft, setRuntimeDraft] = useState<RuntimeDraft | null>(null);
  const [defaultsDraft, setDefaultsDraft] = useState<DefaultsDraft | null>(null);

  // ── Mutations ─────────────────────────────────────────────────

  const settingsMutation: SettingsMutation = useMutation({
    mutationFn: upsertSystemSettings,
    onMutate: () => startAdminAction('Salvando configurações...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Configurações atualizadas.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-settings'] });
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

  // ── Derived settings values ──────────────────────────────────

  const data = settingsQuery.data;

  const companySettings: CompanyDraft | null = companyDraft ?? data ?? null;
  const operationsSettings: OperationsDraft | null =
    operationsDraft ?? (data ? toOperationsDraft(data) : null);
  const runtimeSettings: RuntimeDraft | null = runtimeDraft ?? (data ? toRuntimeDraft(data) : null);

  // ── Profile defaults ─────────────────────────────────────────

  const enabledProfiles = (llmQuery.data?.profiles ?? []).filter((p: LlmProfile) => p.isEnabled);
  const primaryProfileId =
    defaultsDraft?.primaryProfileId ?? llmQuery.data?.defaults?.primaryProfileId ?? '';
  const omProfileId = defaultsDraft?.omProfileId ?? llmQuery.data?.defaults?.omProfileId ?? '';
  const hiringRhProfileId =
    defaultsDraft?.hiringRhProfileId ?? llmQuery.data?.defaults?.hiringRhProfileId ?? '';
  const primaryProfileName = enabledProfiles.find(
    (p: LlmProfile) => p.profileId === primaryProfileId,
  )?.name;
  const omProfileName = enabledProfiles.find((p: LlmProfile) => p.profileId === omProfileId)?.name;
  const hiringRhProfileName = enabledProfiles.find(
    (p: LlmProfile) => p.profileId === hiringRhProfileId,
  )?.name;

  const errorMessage = defaultsMutation.error?.message ?? llmQuery.error?.message;

  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-[-0.04em]">Geral</h1>
        <p className="text-sm text-muted-foreground">
          Ajuste a identidade da empresa, o comportamento global do runtime e os perfis padrão do
          sistema.
        </p>
      </div>

      {settingsQuery.isLoading && !settingsQuery.data ? (
        <AdminLoadingState label="Carregando configurações..." />
      ) : null}

      {settingsQuery.error && !settingsQuery.data ? (
        <div className="rounded-sm border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {settingsQuery.error.message}
        </div>
      ) : null}

      {companySettings ? (
        <CompanySettingsSection
          companySettings={companySettings}
          settingsQuery={settingsQuery}
          settingsMutation={settingsMutation}
          onCompanyDraftChange={setCompanyDraft}
        />
      ) : null}

      {operationsSettings ? (
        <OperationsSettingsSection
          operationsSettings={operationsSettings}
          settingsQuery={settingsQuery}
          settingsMutation={settingsMutation}
          onOperationsDraftChange={setOperationsDraft}
        />
      ) : null}

      {runtimeSettings ? (
        <RuntimeSettingsSection
          runtimeSettings={runtimeSettings}
          settingsQuery={settingsQuery}
          settingsMutation={settingsMutation}
          onRuntimeDraftChange={setRuntimeDraft}
        />
      ) : null}

      <section className="border-t border-border pt-6">
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
          errorMessage={errorMessage}
          onPrimaryProfileChange={(value) =>
            setDefaultsDraft((current) => ({
              primaryProfileId: value,
              omProfileId: current?.omProfileId ?? llmQuery.data?.defaults?.omProfileId ?? '',
              hiringRhProfileId:
                current?.hiringRhProfileId ?? llmQuery.data?.defaults?.hiringRhProfileId ?? '',
            }))
          }
          onOmProfileChange={(value) =>
            setDefaultsDraft((current) => ({
              primaryProfileId:
                current?.primaryProfileId ?? llmQuery.data?.defaults?.primaryProfileId ?? '',
              omProfileId: value,
              hiringRhProfileId:
                current?.hiringRhProfileId ?? llmQuery.data?.defaults?.hiringRhProfileId ?? '',
            }))
          }
          onHiringRhProfileChange={(value) =>
            setDefaultsDraft((current) => ({
              primaryProfileId:
                current?.primaryProfileId ?? llmQuery.data?.defaults?.primaryProfileId ?? '',
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
      </section>
    </div>
  );
}
