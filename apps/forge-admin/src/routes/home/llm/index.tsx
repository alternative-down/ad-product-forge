import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/admin';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  getSystemLlm,
  upsertLlmModelPrice,
  upsertLlmProfile,
  type LlmProfile,
  type UpsertLlmModelPriceInput,
  type UpsertLlmProfileInput,
} from '@/lib/admin-api';

export const Route = createFileRoute('/home/llm/')({
  component: HomeLlmIndexRoute,
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

function createEmptyPriceForm(): UpsertLlmModelPriceInput {
  return {
    modelKey: '',
    inputPerMillionUsd: 0,
    inputCachePerMillionUsd: 0,
    outputPerMillionUsd: 0,
  };
}

function HomeLlmIndexRoute() {
  const queryClient = useQueryClient();
  const llmQuery = useQuery({
    queryKey: ['admin', 'system-llm'],
    queryFn: getSystemLlm,
  });
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileForm, setProfileForm] = useState<UpsertLlmProfileInput>(createEmptyProfileForm);
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [priceForm, setPriceForm] = useState<UpsertLlmModelPriceInput>(createEmptyPriceForm);
  const profileMutation = useMutation({
    mutationFn: upsertLlmProfile,
    onSuccess: async () => {
      setProfileDialogOpen(false);
      setProfileForm(createEmptyProfileForm());
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-llm'] });
    },
  });
  const priceMutation = useMutation({
    mutationFn: upsertLlmModelPrice,
    onSuccess: async () => {
      setPriceDialogOpen(false);
      setPriceForm(createEmptyPriceForm());
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-llm'] });
    },
  });
  const sortedProfiles = useMemo(
    () => [...(llmQuery.data?.profiles ?? [])].sort((left, right) => left.name.localeCompare(right.name)),
    [llmQuery.data?.profiles],
  );
  const sortedPrices = useMemo(
    () => [...(llmQuery.data?.prices ?? [])].sort((left, right) => left.modelKey.localeCompare(right.modelKey)),
    [llmQuery.data?.prices],
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader title="LLM" />

      <Tabs defaultValue="profiles" className="space-y-6">
        <TabsList className="h-auto gap-2 rounded-xl bg-secondary/80 p-1.5">
          <TabsTrigger
            value="profiles"
            className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground"
          >
            Perfil
          </TabsTrigger>
          <TabsTrigger
            value="prices"
            className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground"
          >
            Preços
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profiles" className="space-y-6">
          <div className="flex justify-end">
            <Button
              className="h-12 px-5"
              onClick={() => {
                setProfileForm(createEmptyProfileForm());
                setProfileDialogOpen(true);
              }}
            >
              Adicionar
            </Button>
          </div>

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
                {sortedProfiles.map((profile) => (
                  <tr key={profile.profileId} className="border-t border-border">
                    <td className="px-4 py-3">{profile.name}</td>
                    <td className="px-4 py-3">{profile.modelKey}</td>
                    <td className="px-4 py-3">{profile.baseUrl || '—'}</td>
                    <td className="px-4 py-3">{profile.isEnabled ? 'Sim' : 'Não'}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        className="h-10 px-3"
                        onClick={() => {
                          setProfileForm(createProfileForm(profile));
                          setProfileDialogOpen(true);
                        }}
                      >
                        Editar
                      </Button>
                    </td>
                  </tr>
                ))}
                {sortedProfiles.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                      Nenhum perfil ainda.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="prices" className="space-y-6">
          <div className="flex justify-end">
            <Button
              className="h-12 px-5"
              onClick={() => {
                setPriceForm(createEmptyPriceForm());
                setPriceDialogOpen(true);
              }}
            >
              Adicionar
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Model key</th>
                  <th className="px-4 py-3 font-medium">Input</th>
                  <th className="px-4 py-3 font-medium">Cache</th>
                  <th className="px-4 py-3 font-medium">Output</th>
                  <th className="px-4 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedPrices.map((price) => (
                  <tr key={price.modelKey} className="border-t border-border">
                    <td className="px-4 py-3">{price.modelKey}</td>
                    <td className="px-4 py-3">{price.inputPerMillionUsd}</td>
                    <td className="px-4 py-3">{price.inputCachePerMillionUsd}</td>
                    <td className="px-4 py-3">{price.outputPerMillionUsd}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        className="h-10 px-3"
                        onClick={() => {
                          setPriceForm({
                            modelKey: price.modelKey,
                            inputPerMillionUsd: price.inputPerMillionUsd,
                            inputCachePerMillionUsd: price.inputCachePerMillionUsd,
                            outputPerMillionUsd: price.outputPerMillionUsd,
                          });
                          setPriceDialogOpen(true);
                        }}
                      >
                        Editar
                      </Button>
                    </td>
                  </tr>
                ))}
                {sortedPrices.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                      Nenhum preço ainda.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{profileForm.profileId ? 'Editar perfil' : 'Adicionar perfil'}</DialogTitle>
          </DialogHeader>

          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              profileMutation.mutate({
                ...profileForm,
                name: profileForm.name.trim(),
                modelKey: profileForm.modelKey.trim(),
                baseUrl: profileForm.baseUrl?.trim() || null,
                apiKey: profileForm.apiKey.trim(),
              });
            }}
          >
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="llm-profile-name">
                  Nome
                </label>
                <Input
                  id="llm-profile-name"
                  value={profileForm.name}
                  onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
                  disabled={profileMutation.isPending}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="llm-model-key">
                  Model key
                </label>
                <Input
                  id="llm-model-key"
                  value={profileForm.modelKey}
                  onChange={(event) => setProfileForm((current) => ({ ...current, modelKey: event.target.value }))}
                  disabled={profileMutation.isPending}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="llm-base-url">
                Base URL
              </label>
              <Input
                id="llm-base-url"
                value={profileForm.baseUrl ?? ''}
                onChange={(event) => setProfileForm((current) => ({ ...current, baseUrl: event.target.value }))}
                disabled={profileMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="llm-api-key">
                API key
              </label>
              <Input
                id="llm-api-key"
                type="password"
                value={profileForm.apiKey}
                onChange={(event) => setProfileForm((current) => ({ ...current, apiKey: event.target.value }))}
                disabled={profileMutation.isPending}
              />
            </div>
            <div className="grid gap-5 md:grid-cols-[180px_auto] md:items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="llm-cost-multiplier">
                  Cost multiplier
                </label>
                <Input
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
                  disabled={profileMutation.isPending}
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
                  disabled={profileMutation.isPending}
                />
                Ativo
              </label>
            </div>
            {llmQuery.error ? <div className="text-sm text-destructive">{llmQuery.error.message}</div> : null}
            {profileMutation.error ? (
              <div className="text-sm text-destructive">{profileMutation.error.message}</div>
            ) : null}
            <DialogFooter>
              <Button type="submit" className="h-12 px-5" disabled={profileMutation.isPending}>
                {profileMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{sortedPrices.some((price) => price.modelKey === priceForm.modelKey) ? 'Editar preço' : 'Adicionar preço'}</DialogTitle>
          </DialogHeader>

          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              priceMutation.mutate({
                modelKey: priceForm.modelKey.trim(),
                inputPerMillionUsd: priceForm.inputPerMillionUsd,
                inputCachePerMillionUsd: priceForm.inputCachePerMillionUsd,
                outputPerMillionUsd: priceForm.outputPerMillionUsd,
              });
            }}
          >
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="llm-price-model-key">
                Model key
              </label>
              <Input
                id="llm-price-model-key"
                value={priceForm.modelKey}
                onChange={(event) => setPriceForm((current) => ({ ...current, modelKey: event.target.value }))}
                disabled={priceMutation.isPending}
              />
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="llm-input-price">
                  Input / 1M
                </label>
                <Input
                  id="llm-input-price"
                  type="number"
                  step="0.000001"
                  value={priceForm.inputPerMillionUsd}
                  onChange={(event) =>
                    setPriceForm((current) => ({
                      ...current,
                      inputPerMillionUsd: Number(event.target.value) || 0,
                    }))
                  }
                  disabled={priceMutation.isPending}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="llm-cache-price">
                  Cache / 1M
                </label>
                <Input
                  id="llm-cache-price"
                  type="number"
                  step="0.000001"
                  value={priceForm.inputCachePerMillionUsd}
                  onChange={(event) =>
                    setPriceForm((current) => ({
                      ...current,
                      inputCachePerMillionUsd: Number(event.target.value) || 0,
                    }))
                  }
                  disabled={priceMutation.isPending}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="llm-output-price">
                  Output / 1M
                </label>
                <Input
                  id="llm-output-price"
                  type="number"
                  step="0.000001"
                  value={priceForm.outputPerMillionUsd}
                  onChange={(event) =>
                    setPriceForm((current) => ({
                      ...current,
                      outputPerMillionUsd: Number(event.target.value) || 0,
                    }))
                  }
                  disabled={priceMutation.isPending}
                />
              </div>
            </div>
            {llmQuery.error ? <div className="text-sm text-destructive">{llmQuery.error.message}</div> : null}
            {priceMutation.error ? <div className="text-sm text-destructive">{priceMutation.error.message}</div> : null}
            <DialogFooter>
              <Button type="submit" className="h-12 px-5" disabled={priceMutation.isPending}>
                {priceMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
