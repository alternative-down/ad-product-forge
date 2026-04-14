import {
  AdminButton,
  AdminDialogBody,
  AdminDialogContent,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminInput,
} from '@/components/admin';
import { Dialog } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import type { UpsertLlmProfileInput } from '@/lib/admin-api';

export function LlmProfileDialog(input: {
  open: boolean;
  pending: boolean;
  profileForm: UpsertLlmProfileInput;
  modelKeys: string[];
  errorMessage?: string;
  onOpenChange(open: boolean): void;
  onProfileFormChange(value: UpsertLlmProfileInput): void;
  onSubmit(): void;
}) {
  return (
    <Dialog open={input.open} onOpenChange={input.onOpenChange}>
      <AdminDialogContent>
        <AdminDialogHeader>
          <AdminDialogTitle>{input.profileForm.profileId ? 'Editar perfil' : 'Novo perfil'}</AdminDialogTitle>
        </AdminDialogHeader>

        <form
          className="flex flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            input.onSubmit();
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
                  value={input.profileForm.name}
                  onChange={(event) =>
                    input.onProfileFormChange({ ...input.profileForm, name: event.target.value })
                  }
                  disabled={input.pending}
                />
              </div>
              <div className="min-w-0 space-y-2">
                <label className="text-sm font-medium" htmlFor="llm-model-key">
                  Model key
                </label>
                <Select
                  value={input.profileForm.modelKey}
                  onValueChange={(value) =>
                    input.onProfileFormChange({
                      ...input.profileForm,
                      modelKey: value,
                    })
                  }
                  disabled={input.pending || input.modelKeys.length === 0}
                >
                  <SelectTrigger id="llm-model-key" className="w-full min-w-0 max-w-full overflow-hidden">
                    <SelectValue
                      className="min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
                      placeholder={input.modelKeys.length > 0 ? 'Selecione um model key' : 'Cadastre um preço antes'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {input.modelKeys.map((modelKey) => (
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
                value={input.profileForm.baseUrl ?? ''}
                onChange={(event) =>
                  input.onProfileFormChange({ ...input.profileForm, baseUrl: event.target.value })
                }
                disabled={input.pending}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="llm-api-key">
                API key
              </label>
              <AdminInput
                id="llm-api-key"
                type="password"
                value={input.profileForm.apiKey}
                onChange={(event) =>
                  input.onProfileFormChange({ ...input.profileForm, apiKey: event.target.value })
                }
                disabled={input.pending}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="llm-contract-multiplier">
                Multiplicador de custo
              </label>
              <AdminInput
                id="llm-contract-multiplier"
                type="number"
                min="0"
                step="any"
                value={input.profileForm.contractCostMultiplier}
                onChange={(event) =>
                  input.onProfileFormChange({
                    ...input.profileForm,
                    contractCostMultiplier: Number(event.target.value) || 1,
                  })
                }
                disabled={input.pending}
              />
            </div>
            {input.errorMessage ? <div className="text-sm text-destructive">{input.errorMessage}</div> : null}
          </AdminDialogBody>
          <AdminDialogFooter>
            <AdminButton type="submit" disabled={input.pending}>
              {input.pending ? 'Salvando...' : 'Salvar'}
            </AdminButton>
          </AdminDialogFooter>
        </form>
      </AdminDialogContent>
    </Dialog>
  );
}
