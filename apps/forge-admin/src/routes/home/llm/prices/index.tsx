import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  AdminButton,
  AdminDialogContent,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminInput,
  PageHeader,
} from '@/components/admin';
import { Dialog } from '@/components/ui/dialog';
import { getSystemLlm, upsertLlmModelPrice, type UpsertLlmModelPriceInput } from '@/lib/admin-api';

export const Route = createFileRoute('/home/llm/prices/')({
  component: HomeLlmPricesRoute,
});

function createEmptyPriceForm(): UpsertLlmModelPriceInput {
  return {
    modelKey: '',
    inputPerMillionUsd: 0,
    inputCachePerMillionUsd: 0,
    outputPerMillionUsd: 0,
  };
}

function HomeLlmPricesRoute() {
  const queryClient = useQueryClient();
  const llmQuery = useQuery({
    queryKey: ['admin', 'system-llm'],
    queryFn: getSystemLlm,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [priceForm, setPriceForm] = useState<UpsertLlmModelPriceInput>(createEmptyPriceForm);
  const mutation = useMutation({
    mutationFn: upsertLlmModelPrice,
    onSuccess: async () => {
      setDialogOpen(false);
      setPriceForm(createEmptyPriceForm());
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-llm'] });
    },
  });
  const prices = useMemo(
    () => [...(llmQuery.data?.prices ?? [])].sort((left, right) => left.modelKey.localeCompare(right.modelKey)),
    [llmQuery.data?.prices],
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader
        title="Preços"
        actions={
          <AdminButton
            onClick={() => {
              setPriceForm(createEmptyPriceForm());
              setDialogOpen(true);
            }}
          >
            Novo
          </AdminButton>
        }
      />

      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="min-w-[760px] w-full text-sm">
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
            {prices.map((price) => (
              <tr key={price.modelKey} className="border-t border-border">
                <td className="px-4 py-3">{price.modelKey}</td>
                <td className="px-4 py-3">{price.inputPerMillionUsd}</td>
                <td className="px-4 py-3">{price.inputCachePerMillionUsd}</td>
                <td className="px-4 py-3">{price.outputPerMillionUsd}</td>
                <td className="px-4 py-3 text-right">
                  <AdminButton
                    variant="ghost"
                    className="h-8 w-8 px-0"
                    onClick={() => {
                      setPriceForm({
                        modelKey: price.modelKey,
                        inputPerMillionUsd: price.inputPerMillionUsd,
                        inputCachePerMillionUsd: price.inputCachePerMillionUsd,
                        outputPerMillionUsd: price.outputPerMillionUsd,
                      });
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Editar</span>
                  </AdminButton>
                </td>
              </tr>
            ))}
            {prices.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                  Nenhum preço ainda.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>{prices.some((price) => price.modelKey === priceForm.modelKey) ? 'Editar preço' : 'Adicionar preço'}</AdminDialogTitle>
          </AdminDialogHeader>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate({
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
              <AdminInput
                id="llm-price-model-key"
                value={priceForm.modelKey}
                onChange={(event) => setPriceForm((current) => ({ ...current, modelKey: event.target.value }))}
                disabled={mutation.isPending}
              />
            </div>
            <div className="grid gap-4 min-[560px]:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="llm-input-price">
                  Input / 1M
                </label>
                <AdminInput
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
                  disabled={mutation.isPending}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="llm-cache-price">
                  Cache / 1M
                </label>
                <AdminInput
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
                  disabled={mutation.isPending}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="llm-output-price">
                  Output / 1M
                </label>
                <AdminInput
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
                  disabled={mutation.isPending}
                />
              </div>
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
