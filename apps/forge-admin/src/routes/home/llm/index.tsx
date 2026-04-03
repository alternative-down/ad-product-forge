import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/admin';
import {
  getSystemLlm,
  upsertLlmModelPrice,
  upsertLlmProfile,
  type UpsertLlmModelPriceInput,
  type UpsertLlmProfileInput,
} from '@/lib/admin-api';

export const Route = createFileRoute('/home/llm/')({
  component: HomeLlmIndexRoute,
});

function HomeLlmIndexRoute() {
  const queryClient = useQueryClient();
  const llmQuery = useQuery({
    queryKey: ['admin', 'system-llm'],
    queryFn: getSystemLlm,
  });
  const [profileForm, setProfileForm] = useState<UpsertLlmProfileInput>({
    name: '',
    modelKey: '',
    baseUrl: '',
    apiKey: '',
    contractCostMultiplier: 1,
    isEnabled: true,
  });
  const [priceForm, setPriceForm] = useState<UpsertLlmModelPriceInput>({
    modelKey: '',
    inputPerMillionUsd: 0,
    inputCachePerMillionUsd: 0,
    outputPerMillionUsd: 0,
  });
  const profileMutation = useMutation({
    mutationFn: upsertLlmProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-llm'] });
      setProfileForm({
        name: '',
        modelKey: '',
        baseUrl: '',
        apiKey: '',
        contractCostMultiplier: 1,
        isEnabled: true,
      });
    },
  });
  const priceMutation = useMutation({
    mutationFn: upsertLlmModelPrice,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-llm'] });
      setPriceForm({
        modelKey: '',
        inputPerMillionUsd: 0,
        inputCachePerMillionUsd: 0,
        outputPerMillionUsd: 0,
      });
    },
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader title="LLM" />
      <Tabs defaultValue="profiles" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profiles">Perfil</TabsTrigger>
          <TabsTrigger value="prices">Preços</TabsTrigger>
        </TabsList>

        <TabsContent value="profiles" className="space-y-6">
          <form
            className="max-w-3xl space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              profileMutation.mutate({
                ...profileForm,
                baseUrl: profileForm.baseUrl?.trim() || null,
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
                />
                Ativo
              </label>
            </div>
            {profileMutation.error ? (
              <div className="text-sm text-destructive">{profileMutation.error.message}</div>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" className="h-12 px-5" disabled={profileMutation.isPending}>
                {profileMutation.isPending ? 'Salvando...' : 'Salvar perfil'}
              </Button>
            </div>
          </form>

          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">Model key</th>
                  <th className="px-4 py-3 font-medium">Base URL</th>
                  <th className="px-4 py-3 font-medium">Ativo</th>
                </tr>
              </thead>
              <tbody>
                {llmQuery.data?.profiles.map((profile) => (
                  <tr key={profile.profileId} className="border-t border-border">
                    <td className="px-4 py-3">{profile.name}</td>
                    <td className="px-4 py-3">{profile.modelKey}</td>
                    <td className="px-4 py-3">{profile.baseUrl || '—'}</td>
                    <td className="px-4 py-3">{profile.isEnabled ? 'Sim' : 'Não'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="prices" className="space-y-6">
          <form
            className="max-w-3xl space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              priceMutation.mutate(priceForm);
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
                />
              </div>
            </div>
            {priceMutation.error ? (
              <div className="text-sm text-destructive">{priceMutation.error.message}</div>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" className="h-12 px-5" disabled={priceMutation.isPending}>
                {priceMutation.isPending ? 'Salvando...' : 'Salvar preço'}
              </Button>
            </div>
          </form>

          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Model key</th>
                  <th className="px-4 py-3 font-medium">Input</th>
                  <th className="px-4 py-3 font-medium">Cache</th>
                  <th className="px-4 py-3 font-medium">Output</th>
                </tr>
              </thead>
              <tbody>
                {llmQuery.data?.prices.map((price) => (
                  <tr key={price.modelKey} className="border-t border-border">
                    <td className="px-4 py-3">{price.modelKey}</td>
                    <td className="px-4 py-3">{price.inputPerMillionUsd}</td>
                    <td className="px-4 py-3">{price.inputCachePerMillionUsd}</td>
                    <td className="px-4 py-3">{price.outputPerMillionUsd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
