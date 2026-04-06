import { TriangleAlert } from 'lucide-react';

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

export type ContractForm = {
  action: 'adjust-budget' | 'top-up';
  amountUsd: number;
};

export function ContractAdjustDialog(input: {
  open: boolean;
  pending: boolean;
  form: ContractForm | null;
  onOpenChange(open: boolean): void;
  onFormChange(value: ContractForm): void;
  onSubmit(): void;
}) {
  return (
    <Dialog open={input.open} onOpenChange={input.onOpenChange}>
      <AdminDialogContent>
        <AdminDialogHeader>
          <AdminDialogTitle>Alterar contrato</AdminDialogTitle>
        </AdminDialogHeader>

        {input.form ? (
          <form
            className="flex flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              input.onSubmit();
            }}
          >
            <AdminDialogBody>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="agent-contract-action">
                  Ação
                </label>
                <Select
                  value={input.form.action}
                  onValueChange={(value: ContractForm['action']) =>
                    input.onFormChange({ ...input.form, action: value })
                  }
                  disabled={input.pending}
                >
                  <SelectTrigger id="agent-contract-action" className="w-full">
                    <SelectValue>
                      {input.form.action === 'top-up' ? 'Adicionar saldo' : 'Ajustar orçamento'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adjust-budget">Ajustar orçamento</SelectItem>
                    <SelectItem value="top-up">Adicionar saldo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="agent-contract-amount">
                  {input.form.action === 'top-up' ? 'Valor adicional' : 'Novo valor semanal'}
                </label>
                <AdminInput
                  id="agent-contract-amount"
                  type="number"
                  step="0.01"
                  value={input.form.amountUsd}
                  onChange={(event) =>
                    input.onFormChange({
                      ...input.form,
                      amountUsd: Number(event.target.value) || 0,
                    })
                  }
                  disabled={input.pending}
                />
              </div>
            </AdminDialogBody>

            <AdminDialogFooter>
              <AdminButton type="submit" disabled={input.pending}>
                {input.pending ? 'Salvando...' : 'Salvar'}
              </AdminButton>
            </AdminDialogFooter>
          </form>
        ) : null}
      </AdminDialogContent>
    </Dialog>
  );
}

export function ContractTerminateDialog(input: {
  open: boolean;
  pending: boolean;
  errorMessage?: string;
  onOpenChange(open: boolean): void;
  onConfirm(): void;
}) {
  return (
    <Dialog open={input.open} onOpenChange={input.onOpenChange}>
      <AdminDialogContent>
        <AdminDialogHeader>
          <AdminDialogTitle>Demitir agente</AdminDialogTitle>
        </AdminDialogHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <AdminDialogBody>
            <div className="flex items-start gap-3 rounded-sm border border-border bg-muted/30 px-4 py-4">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="space-y-2 text-sm text-foreground">
                <div>Esta ação encerra o agente agora.</div>
                <div>O saldo restante do contrato atual será estornado como entrada no caixa da empresa.</div>
              </div>
            </div>
            {input.errorMessage ? <div className="text-sm text-destructive">{input.errorMessage}</div> : null}
          </AdminDialogBody>

          <AdminDialogFooter>
            <AdminButton variant="ghost" onClick={() => input.onOpenChange(false)} disabled={input.pending}>
              Cancelar
            </AdminButton>
            <AdminButton variant="destructive" onClick={input.onConfirm} disabled={input.pending}>
              {input.pending ? 'Demitindo...' : 'Confirmar'}
            </AdminButton>
          </AdminDialogFooter>
        </div>
      </AdminDialogContent>
    </Dialog>
  );
}
