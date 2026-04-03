import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/admin';
import { getSystemSettings, upsertSystemSettings } from '@/lib/admin-api';

export const Route = createFileRoute('/home/')({
  component: HomeIndexRoute,
});

function HomeIndexRoute() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['admin', 'system-settings'],
    queryFn: getSystemSettings,
  });
  const [draft, setDraft] = useState<{
    companyName: string;
    companyContext: string;
  } | null>(null);
  const mutation = useMutation({
    mutationFn: upsertSystemSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-settings'] });
    },
  });
  const companyName = draft?.companyName ?? settingsQuery.data?.companyName ?? '';
  const companyContext = draft?.companyContext ?? settingsQuery.data?.companyContext ?? '';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader title="Geral" />
      <form
        className="max-w-3xl space-y-5"
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
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">Empresa</div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="company-name">
            Nome
          </label>
          <Input
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
          <Textarea
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
        {settingsQuery.error ? (
          <div className="text-sm text-destructive">{settingsQuery.error.message}</div>
        ) : null}
        {mutation.error ? (
          <div className="text-sm text-destructive">{mutation.error.message}</div>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" className="h-12 px-5" disabled={settingsQuery.isLoading || mutation.isPending}>
            {mutation.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </form>
    </div>
  );
}
