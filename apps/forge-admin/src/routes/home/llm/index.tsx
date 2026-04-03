import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import {
  AdminButton,
  AdminDialogContent,
  AdminDialogFooter,
  AdminInput,
  PageHeader,
} from '@/components/admin';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getSystemLlm, upsertLlmProfile, type LlmProfile, type UpsertLlmProfileInput } from '@/lib/admin-api';

export const Route = createFileRoute('/home/llm/')({
  component: HomeLlmProfilesRoute,
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

function HomeLlmProfilesRoute() {
  const queryClient = useQueryClient();
  const llmQuery = useQuery({
    queryKey: ['admin', 'system-llm'],
    queryFn: getSystemLlm,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [profileForm, setProfileForm] = useState<UpsertLlmProfileInput>(createEmptyProfileForm);
  const mutation = useMutation({
    mutationFn: upsertLlmProfile,
    onSuccess: async () => {
      setDialogOpen(false);
      setProfileForm(createEmptyProfileForm());
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-llm'] });
    },
  });
  const profiles = useMemo(
    () => [...(llmQuery.data?.profiles ?? [])].sort((left, right) => left.name.localeCompare(right.name)),
    [llmQuery.data?.profiles],
  );
  const modelKeys = useMemo(
    () => [...new Set((llmQuery.data?.prices ?? []).map((price) => price.modelKey))].sort((left, right) => left.localeCompare(right)),
    [llmQuery.data?.prices],
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader
        title="Perfis"
        actions={
          <AdminButton
            onClick={() => {
              setProfileForm(createEmptyProfileForm());
              setDialogOpen(true);
            }}
          >
            Adicionar
          </AdminButton>
        }
      />

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">Model key</th>
              <th className="px-4 py-3 font-medium">Base URL</th>
              <th className="px-4 py-3 font-medium">Ativo</th>
              <th className="px-4 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => (
              <tr key={profile.profileId} className="border-t border-border">
                <td className="px-4 py-3">{profile.name}</td>
                <td className="px-4 py-3">{profile.modelKey}</td>
                <td className="px-4 py-3">{profile.baseUrl || '—'}</td>
                <td className="px-4 py-3">{profile.isEnabled ? 'Sim' : 'Não'}</td>
                <td className="px-4 py-3 text-right">
                  <AdminButton
                    variant="ghost"
                    className="h-9 px-3"
                    onClick={() => {
                      setProfileForm(createProfileForm(profile));
                      setDialogOpen(true);
                    }}
                  >
                    Editar
                  </AdminButton>
                </td>
              </tr>
            ))}
            {profiles.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                  Nenhum perfil ainda.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AdminDialogContent>
          <DialogHeader>
            <DialogTitle>{profileForm.profileId ? 'Editar perfil' : 'Adicionar perfil'}</DialogTitle>
          </DialogHeader>

          <form
            className="space-y-5"
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
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Model key
                </label>
                <Combobox
                  items={modelKeys}
                  value={profileForm.modelKey || null}
                  onValueChange={(value) =>
                    setProfileForm((current) => ({
                      ...current,
                      modelKey: value ?? '',
                    }))
                  }
                >
                  <ComboboxInput
                    placeholder={modelKeys.length > 0 ? 'Selecione um model key' : 'Cadastre um preço antes'}
                    className="h-10 w-full rounded-md border-border/80 bg-background/80 shadow-none"
                    disabled={mutation.isPending || modelKeys.length === 0}
                  />
                  <ComboboxContent className="rounded-xl border border-border/70 bg-background/98 shadow-lg shadow-black/5">
                    <ComboboxEmpty>Nenhum model key disponível.</ComboboxEmpty>
                    <ComboboxList>
                      {modelKeys.map((modelKey) => (
                        <ComboboxItem key={modelKey} value={modelKey}>
                          {modelKey}
                        </ComboboxItem>
                      ))}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
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
            <div className="grid gap-4 min-[560px]:grid-cols-[minmax(0,180px)_auto] min-[560px]:items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="llm-cost-multiplier">
                  Cost multiplier
                </label>
                <AdminInput
                  id="llm-cost-multiplier"
                  type="number"
                  step="0.01"
                  value={profileForm.contractCostMultiplier}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      contractCostMultiplier: Number(event.target.value) || 0,
                    }))
                  }
                  disabled={mutation.isPending}
                />
              </div>
              <label className="flex h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={profileForm.isEnabled}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      isEnabled: event.target.checked,
                    }))
                  }
                  disabled={mutation.isPending}
                />
                Ativo
              </label>
            </div>
            {llmQuery.error ? <div className="text-sm text-destructive">{llmQuery.error.message}</div> : null}
            {mutation.error ? <div className="text-sm text-destructive">{mutation.error.message}</div> : null}
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
