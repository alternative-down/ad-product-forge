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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getSystemLlm, upsertLlmModelPrice, type UpsertLlmModelPriceInput } from '@/lib/admin-api';

export const Route = createFileRoute('/integrations/prices/')({
  component: IntegrationsPricesRoute,
});

function createEmptyPriceForm(): UpsertLlmModelPriceInput {
  return {
    modelKey: '',
    inputPerMillionUsd: 0,
    inputCachePerMillionUsd: 0,
    outputPerMillionUsd: 0,
  };
}

function IntegrationsPricesRoute() {
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
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader title="Preços" />

      <div className="flex justify-end">
        <AdminButton
          onClick={() => {
            setPriceForm(createEmptyPriceForm());
            setDialogOpen(true);
          }}
        >
          Novo
        </AdminButton>
      </div>

      <div className="w-full min-w-0 overflow-hidden rounded-sm border border-border">
        <Table className="min-w-[760px] text-sm">
          <TableHeader className="bg-muted/50 text-left text-muted-foreground">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4 py-3 font-medium">Model key</TableHead>
              <TableHead className="px-4 py-3 text-right font-medium">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prices.map((price) => (
              <TableRow key={price.modelKey}>
                <TableCell className="px-4 py-3">{price.modelKey}</TableCell>
                <TableCell className="px-4 py-3 text-right">
                  <AdminButton
                    variant="ghost"
                    size="icon"
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
                </TableCell>
              </TableRow>
            ))}
            {prices.length === 0 ? (
              <TableRow>
                <TableCell className="px-4 py-6 text-muted-foreground" colSpan={2}>
                  Nenhum preço ainda.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>{prices.some((price) => price.modelKey === priceForm.modelKey) ? 'Editar preço' : 'Novo preço'}</AdminDialogTitle>
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
