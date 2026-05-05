import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AdminLoadingState } from '@/components/admin';
import { getSystemLlm, getSystemSettings, updateLlmDefaults, upsertSystemSettings } from '@/lib/admin-api';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';

import { CompanySettingsSection } from './company-settings-section';
import { OperationsSettingsSection } from './operations-settings-section';
import { ProfileDefaultsSection } from '../integrations/-profile-defaults-section';
import { RuntimeSettingsSection } from './runtime-settings-section';

export const Route = createFileRoute('/settings/')({
  component: SettingsGeneralRoute,
});

function SettingsGeneralRoute() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['admin', 'system-settings'],
    queryFn: getSystemSettings,
  });
  const llmQuery = useQuery({
    queryKey: ['admin', 'system-llm'],
    queryFn: getSystemLlm,
  });
  const [companyDraft, setCompanyDraft] = useState<{
    companyName: string;
    companyContext: string;
  } | null>(null);
  const [operationsDraft, setOperationsDraft] = useState<{
    stepDelayEnabled: boolean;
    communicationDmFlushingEnabled: boolean;
    communicationGroupFlushingEnabled: boolean;
  } | null>(null);
  const [runtimeDraft, setRuntimeDraft] = useState<{
    memoryLastMessagesFullEnabled: boolean;
    memoryLastMessagesCount: string;
    tokenCountFilterEnabled: boolean;
    tokenCountFilterLimit: string;
    checkpointedOmEnabled: boolean;
    checkpointedOmTotalContextTokens: string;
    checkpointedOmRecentRawTokens: string;
    checkpointedOmRawObservationBatchTokens: string;
    checkpointedOmObservationReflectionBatchTokens: string;
    checkpointedOmObservationSupportTokens: string;
    checkpointedOmReflectionSupportTokens: string;
    ltmRecallScoreThreshold: string;
    ltmRecallDocumentCount: string;
  } | null>(null);
  const [defaultsDraft, setDefaultsDraft] = useState<{
    primaryProfileId: string;
    omProfileId: string;
    hiringRhProfileId: string;
  } | null>(null);
  const settingsMutation = useMutation({
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

  const companySettings = companyDraft ?? (settingsQuery.data
    ? {
        companyName: settingsQuery.data.companyName,
        companyContext: settingsQuery.data.companyContext,
      }
    : null);
  const operationsSettings = operationsDraft ?? (settingsQuery.data
    ? {
        stepDelayEnabled: settingsQuery.data.stepDelayEnabled,
        communicationDmFlushingEnabled: settingsQuery.data.communicationDmFlushingEnabled,
        communicationGroupFlushingEnabled: settingsQuery.data.communicationGroupFlushingEnabled,
      }
    : null);
  const runtimeSettings = runtimeDraft ?? (settingsQuery.data
    ? {
        memoryLastMessagesFullEnabled: settingsQuery.data.memoryLastMessagesFullEnabled,
        memoryLastMessagesCount: String(settingsQuery.data.memoryLastMessagesCount),
        tokenCountFilterEnabled: settingsQuery.data.tokenCountFilterEnabled,
        tokenCountFilterLimit: String(settingsQuery.data.tokenCountFilterLimit),
        checkpointedOmEnabled: settingsQuery.data.checkpointedOmEnabled,
        checkpointedOmTotalContextTokens: String(settingsQuery.data.checkpointedOmTotalContextTokens),
        checkpointedOmRecentRawTokens: String(settingsQuery.data.checkpointedOmRecentRawTokens),
        checkpointedOmRawObservationBatchTokens: String(settingsQuery.data.checkpointedOmRawObservationBatchTokens),
        checkpointedOmObservationReflectionBatchTokens: String(settingsQuery.data.checkpointedOmObservationReflectionBatchTokens),
        checkpointedOmObservationSupportTokens: String(settingsQuery.data.checkpointedOmObservationSupportTokens),
        checkpointedOmReflectionSupportTokens: String(settingsQuery.data.checkpointedOmReflectionSupportTokens),
        ltmRecallScoreThreshold: String(settingsQuery.data.ltmRecallScoreThreshold),
        ltmRecallDocumentCount: String(settingsQuery.data.ltmRecallDocumentCount),
      }
    : null);

  const enabledProfiles = (llmQuery.data?.profiles ?? []).filter((profile) => profile.isEnabled);
  const primaryProfileId = defaultsDraft?.primaryProfileId ?? llmQuery.data?.defaults?.primaryProfileId ?? '';
  const omProfileId = defaultsDraft?.omProfileId ?? llmQuery.data?.defaults?.omProfileId ?? '';
  const hiringRhProfileId = defaultsDraft?.hiringRhProfileId ?? llmQuery.data?.defaults?.hiringRhProfileId ?? '';
  const primaryProfileName = enabledProfiles.find((profile) => profile.profileId === primaryProfileId)?.name;
  const omProfileName = enabledProfiles.find((profile) => profile.profileId === omProfileId)?.name;
  const hiringRhProfileName = enabledProfiles.find((profile) => profile.profileId === hiringRhProfileId)?.name;

  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-[-0.04em]">Geral</h1>
        <p className="text-sm text-muted-foreground">
          Ajuste a identidade da empresa, o comportamento global do runtime e os perfis padrão do sistema.
        </p>
      </div>

      {settingsQuery.isLoading && !settingsQuery.data ? (
        <AdminLoadingState label="Carregando configurações..." />
      ) : null}

      {companySettings ? (
        <CompanySettingsSection
          companySettings={companySettings}
          settingsQuery={settingsQuery}
          settingsMutation={settingsMutation as any}
          onCompanyDraftChange={setCompanyDraft}
        />
      ) : null}

      {operationsSettings ? (
        <OperationsSettingsSection
          operationsSettings={operationsSettings}
          settingsQuery={settingsQuery}
          settingsMutation={settingsMutation as any}
          onOperationsDraftChange={setOperationsDraft}
        />
      ) : null}

      {runtimeSettings ? (
        <RuntimeSettingsSection
          runtimeSettings={runtimeSettings}
          settingsQuery={settingsQuery}
          settingsMutation={settingsMutation as any}
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
      </section>
    </div>
  );
}
