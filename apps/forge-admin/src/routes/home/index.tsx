import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { AdminButton, AdminInput, AdminTextarea, PageHeader } from '@/components/admin';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getSystemLlm, getSystemSettings, updateLlmDefaults, upsertSystemSettings } from '@/lib/admin-api';

export const Route = createFileRoute('/home/')({
  component: HomeIndexRoute,
});

function HomeIndexRoute() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['admin', 'system-settings'],
    queryFn: getSystemSettings,
  });
  const llmQuery = useQuery({
    queryKey: ['admin', 'system-llm'],
    queryFn: getSystemLlm,
  });
  const [draft, setDraft] = useState<{
    companyName: string;
    companyContext: string;
  } | null>(null);
  const [defaultsDraft, setDefaultsDraft] = useState<{
    primaryProfileId: string;
    omProfileId: string;
    hiringRhProfileId: string;
  } | null>(null);
  const mutation = useMutation({
    mutationFn: upsertSystemSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-settings'] });
    },
  });
  const defaultsMutation = useMutation({
    mutationFn: updateLlmDefaults,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-llm'] });
    },
  });
  const companyName = draft?.companyName ?? settingsQuery.data?.companyName ?? '';
  const companyContext = draft?.companyContext ?? settingsQuery.data?.companyContext ?? '';
  const enabledProfiles = useMemo(
    () => (llmQuery.data?.profiles ?? []).filter((profile) => profile.isEnabled),
    [llmQuery.data?.profiles],
  );
  const primaryProfileId = defaultsDraft?.primaryProfileId ?? llmQuery.data?.defaults?.primaryProfileId ?? '';
  const omProfileId = defaultsDraft?.omProfileId ?? llmQuery.data?.defaults?.omProfileId ?? '';
  const hiringRhProfileId = defaultsDraft?.hiringRhProfileId ?? llmQuery.data?.defaults?.hiringRhProfileId ?? '';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader title="Geral" />

      <div className="max-w-3xl space-y-6">
        <section className="space-y-5">
          <div className="space-y-1">
            <div className="text-lg font-semibold tracking-[-0.03em]">Empresa</div>
          </div>

          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();

              if (!settingsQuery.data) {
                return;
              }

              mutation.mutate({
                companyName: companyName.trim(),
                companyContext: companyContext.trim(),
                stepDelayEnabled: settingsQuery.data.stepDelayEnabled,
              });
            }}
          >
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="company-name">
                Nome
              </label>
              <AdminInput
                id="company-name"
                value={companyName}
                onChange={(event) =>
                  setDraft({
                    companyName: event.target.value,
                    companyContext,
                  })
                }
                disabled={settingsQuery.isLoading || mutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="company-description">
                Descrição
              </label>
              <AdminTextarea
                id="company-description"
                rows={8}
                value={companyContext}
                onChange={(event) =>
                  setDraft({
                    companyName,
                    companyContext: event.target.value,
                  })
                }
                disabled={settingsQuery.isLoading || mutation.isPending}
              />
            </div>
            {settingsQuery.error ? <div className="text-sm text-destructive">{settingsQuery.error.message}</div> : null}
            {mutation.error ? <div className="text-sm text-destructive">{mutation.error.message}</div> : null}
            <div className="flex justify-end">
              <AdminButton type="submit" disabled={settingsQuery.isLoading || mutation.isPending}>
                {mutation.isPending ? 'Salvando...' : 'Salvar'}
              </AdminButton>
            </div>
          </form>
        </section>

        <section className="space-y-5">
          <div className="space-y-1">
            <div className="text-lg font-semibold tracking-[-0.03em]">Perfis padrão</div>
          </div>

          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();

              defaultsMutation.mutate({
                primaryProfileId,
                omProfileId,
                hiringRhProfileId,
              });
            }}
          >
            <div className="grid gap-4 min-[720px]:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="default-primary-profile">
                  Principal
                </label>
                <Select
                  value={primaryProfileId}
                  onValueChange={(value) =>
                    setDefaultsDraft((current) => ({
                      primaryProfileId: value,
                      omProfileId: current?.omProfileId ?? llmQuery.data?.defaults?.omProfileId ?? '',
                      hiringRhProfileId: current?.hiringRhProfileId ?? llmQuery.data?.defaults?.hiringRhProfileId ?? '',
                    }))
                  }
                  disabled={llmQuery.isLoading || defaultsMutation.isPending || enabledProfiles.length === 0}
                >
                  <SelectTrigger id="default-primary-profile" className="w-full">
                    <SelectValue placeholder="Selecione um perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {enabledProfiles.map((profile) => (
                      <SelectItem key={profile.profileId} value={profile.profileId}>
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="default-om-profile">
                  OM
                </label>
                <Select
                  value={omProfileId}
                  onValueChange={(value) =>
                    setDefaultsDraft((current) => ({
                      primaryProfileId: current?.primaryProfileId ?? llmQuery.data?.defaults?.primaryProfileId ?? '',
                      omProfileId: value,
                      hiringRhProfileId: current?.hiringRhProfileId ?? llmQuery.data?.defaults?.hiringRhProfileId ?? '',
                    }))
                  }
                  disabled={llmQuery.isLoading || defaultsMutation.isPending || enabledProfiles.length === 0}
                >
                  <SelectTrigger id="default-om-profile" className="w-full">
                    <SelectValue placeholder="Selecione um perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {enabledProfiles.map((profile) => (
                      <SelectItem key={profile.profileId} value={profile.profileId}>
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="default-hiring-rh-profile">
                  Hiring RH
                </label>
                <Select
                  value={hiringRhProfileId}
                  onValueChange={(value) =>
                    setDefaultsDraft((current) => ({
                      primaryProfileId: current?.primaryProfileId ?? llmQuery.data?.defaults?.primaryProfileId ?? '',
                      omProfileId: current?.omProfileId ?? llmQuery.data?.defaults?.omProfileId ?? '',
                      hiringRhProfileId: value,
                    }))
                  }
                  disabled={llmQuery.isLoading || defaultsMutation.isPending || enabledProfiles.length === 0}
                >
                  <SelectTrigger id="default-hiring-rh-profile" className="w-full">
                    <SelectValue placeholder="Selecione um perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {enabledProfiles.map((profile) => (
                      <SelectItem key={profile.profileId} value={profile.profileId}>
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {llmQuery.error ? <div className="text-sm text-destructive">{llmQuery.error.message}</div> : null}
            {defaultsMutation.error ? <div className="text-sm text-destructive">{defaultsMutation.error.message}</div> : null}
            <div className="flex justify-end">
              <AdminButton
                type="submit"
                disabled={
                  llmQuery.isLoading ||
                  defaultsMutation.isPending ||
                  enabledProfiles.length === 0 ||
                  !primaryProfileId ||
                  !omProfileId ||
                  !hiringRhProfileId
                }
              >
                {defaultsMutation.isPending ? 'Salvando...' : 'Salvar'}
              </AdminButton>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
