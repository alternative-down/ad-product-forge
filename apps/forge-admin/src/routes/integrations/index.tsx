import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Power, PowerOff } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  AdminDialogBody,
  AdminButton,
  AdminDialogContent,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminInput,
  PageHeader,
} from '@/components/admin';
import { Dialog } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getSystemLlm, updateLlmDefaults, upsertLlmProfile, type LlmProfile, type UpsertLlmProfileInput } from '@/lib/admin-api';

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
    onSuccess: async () => {
      setDialogOpen(false);
      setProfileForm(createEmptyProfileForm());
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-llm'] });
    },
  });
  const statusMutation = useMutation({
    mutationFn: upsertLlmProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-llm'] });
    },
  });
  const defaultsMutation = useMutation({
    mutationFn: updateLlmDefaults,
    onSuccess: async () => {
      setDefaultsDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-llm'] });
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
      <PageHeader title="Perfis" />

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
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
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
                  <SelectValue placeholder="Selecione um perfil">{primaryProfileName}</SelectValue>
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
                  <SelectValue placeholder="Selecione um perfil">{omProfileName}</SelectValue>
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
                  <SelectValue placeholder="Selecione um perfil">{hiringRhProfileName}</SelectValue>
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

      <section className="space-y-5 border-t border-border pt-6">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">Perfis cadastrados</div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value === 'inactive' ? 'inactive' : 'active')}>
            <TabsList className="h-auto justify-start gap-1 rounded-none bg-transparent p-0">
              <TabsTrigger
                value="active"
                className="h-9 rounded-sm px-3 py-2 text-sm text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground"
              >
                Ativos
              </TabsTrigger>
              <TabsTrigger
                value="inactive"
                className="h-9 rounded-sm px-3 py-2 text-sm text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground"
              >
                Inativos
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <AdminButton
            onClick={() => {
              setProfileForm(createEmptyProfileForm());
              setDialogOpen(true);
            }}
          >
            Novo
          </AdminButton>
        </div>

        <div className="w-full min-w-0 overflow-hidden rounded-sm border border-border">
          <Table className="text-sm">
            <TableHeader className="bg-muted/50 text-left text-muted-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 py-3 font-medium">Nome</TableHead>
                <TableHead className="px-4 py-3 text-right font-medium">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProfiles.map((profile) => (
                <TableRow key={profile.profileId}>
                  <TableCell className="px-4 py-3">{profile.name}</TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <AdminButton
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setProfileForm(createProfileForm(profile));
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Editar</span>
                      </AdminButton>
                      <AdminButton
                        variant="ghost"
                        size="icon"
                        disabled={statusMutation.isPending}
                        onClick={() =>
                          statusMutation.mutate({
                            ...createProfileForm(profile),
                            isEnabled: !profile.isEnabled,
                          })
                        }
                      >
                        {profile.isEnabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                        <span className="sr-only">{profile.isEnabled ? 'Inativar' : 'Ativar'}</span>
                      </AdminButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredProfiles.length === 0 ? (
                <TableRow>
                  <TableCell className="px-4 py-6 text-muted-foreground" colSpan={2}>
                    {statusFilter === 'active' ? 'Nenhum perfil ativo.' : 'Nenhum perfil inativo.'}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>{profileForm.profileId ? 'Editar perfil' : 'Novo perfil'}</AdminDialogTitle>
          </AdminDialogHeader>

          <form
            className="flex flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate({
                ...profileForm,
                name: profileForm.name.trim(),
                modelKey: profileForm.modelKey.trim(),
                baseUrl: profileForm.baseUrl?.trim() || null,
                apiKey: profileForm.apiKey.trim(),
              });
            }}
          >
            <AdminDialogBody>
            <div className="grid gap-4 min-[560px]:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="llm-profile-name">
                  Nome
                </label>
                <AdminInput
                  id="llm-profile-name"
                  value={profileForm.name}
                  onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
                  disabled={mutation.isPending}
                />
              </div>
              <div className="min-w-0 space-y-2">
                <label className="text-sm font-medium" htmlFor="llm-model-key">
                  Model key
                </label>
                <Select
                  value={profileForm.modelKey}
                  onValueChange={(value) =>
                    setProfileForm((current) => ({
                      ...current,
                      modelKey: value,
                    }))
                  }
                  disabled={mutation.isPending || modelKeys.length === 0}
                >
                  <SelectTrigger id="llm-model-key" className="w-full min-w-0 max-w-full overflow-hidden">
                    <SelectValue
                      className="min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
                      placeholder={modelKeys.length > 0 ? 'Selecione um model key' : 'Cadastre um preço antes'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {modelKeys.map((modelKey) => (
                      <SelectItem key={modelKey} value={modelKey}>
                        {modelKey}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="llm-base-url">
                Base URL
              </label>
              <AdminInput
                id="llm-base-url"
                value={profileForm.baseUrl ?? ''}
                onChange={(event) => setProfileForm((current) => ({ ...current, baseUrl: event.target.value }))}
                disabled={mutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="llm-api-key">
                API key
              </label>
              <AdminInput
                id="llm-api-key"
                type="password"
                value={profileForm.apiKey}
                onChange={(event) => setProfileForm((current) => ({ ...current, apiKey: event.target.value }))}
                disabled={mutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="llm-contract-multiplier">
                Multiplicador de custo
              </label>
              <AdminInput
                id="llm-contract-multiplier"
                type="number"
                min="0.000001"
                step="0.01"
                value={profileForm.contractCostMultiplier}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    contractCostMultiplier: Number(event.target.value) || 1,
                  }))
                }
                disabled={mutation.isPending}
              />
            </div>
            {llmQuery.error ? <div className="text-sm text-destructive">{llmQuery.error.message}</div> : null}
            {mutation.error ? <div className="text-sm text-destructive">{mutation.error.message}</div> : null}
            </AdminDialogBody>
            <AdminDialogFooter>
              <AdminButton type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Salvando...' : 'Salvar'}
              </AdminButton>
            </AdminDialogFooter>
          </form>
        </AdminDialogContent>
      </Dialog>
    </div>
  );
}
