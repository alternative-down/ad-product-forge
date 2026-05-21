import { Check, Power, PowerOff, X } from 'lucide-react';

import { AdminButton } from '@/components/admin';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type AgendaRow =
  | {
      kind: 'planned';
      id: string;
      name: string;
      amountLabel: string;
      dateLabel: string;
      typeLabel: string;
      statusLabel: string;
    }
  | {
      kind: 'recurring-payable';
      id: string;
      name: string;
      amountLabel: string;
      dateLabel: string;
      typeLabel: string;
      statusLabel: string;
      isActive: boolean;
    }
  | {
      kind: 'contract';
      id: string;
      name: string;
      amountLabel: string;
      dateLabel: string;
      typeLabel: string;
      statusLabel: string;
    };

export function MovementAgendaTable(input: {
  rows: AgendaRow[];
  pending: boolean;
  onPost(entryId: string): void;
  onCancel(entryId: string): void;
  onToggleRecurring(payableId: string, isActive: boolean): void;
}) {
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-sm border border-border">
      <Table className="text-sm">
        <TableHeader className="bg-muted/50 text-left text-muted-foreground">
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-4 py-3 font-medium">Nome</TableHead>
            <TableHead className="px-4 py-3 font-medium">Valor</TableHead>
            <TableHead className="px-4 py-3 font-medium">Data</TableHead>
            <TableHead className="px-4 py-3 font-medium">Tipo</TableHead>
            <TableHead className="px-4 py-3 font-medium">Status</TableHead>
            <TableHead className="px-4 py-3 text-right font-medium">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {input.rows.map((item) => (
            <TableRow key={`${item.kind}:${item.id}`}>
              <TableCell className="px-4 py-3">{item.name}</TableCell>
              <TableCell className="px-4 py-3">{item.amountLabel}</TableCell>
              <TableCell className="px-4 py-3">{item.dateLabel}</TableCell>
              <TableCell className="px-4 py-3">{item.typeLabel}</TableCell>
              <TableCell className="px-4 py-3">{item.statusLabel}</TableCell>
              <TableCell className="px-4 py-3 text-right">
                <div className="flex justify-end gap-2">
                  {item.kind === 'planned' ? (
                    <>
                      <AdminButton
                        variant="ghost"
                        size="icon"
                        disabled={input.pending}
                        onClick={() => input.onPost(item.id)}
                      >
                        <Check className="h-4 w-4" />
                        <span className="sr-only">Postar</span>
                      </AdminButton>
                      <AdminButton
                        variant="ghost"
                        size="icon"
                        disabled={input.pending}
                        onClick={() => input.onCancel(item.id)}
                      >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Cancelar</span>
                      </AdminButton>
                    </>
                  ) : null}

                  {item.kind === 'recurring-payable' ? (
                    <AdminButton
                      variant="ghost"
                      size="icon"
                      disabled={input.pending}
                      onClick={() => input.onToggleRecurring(item.id, !item.isActive)}
                    >
                      {item.isActive ? (
                        <PowerOff className="h-4 w-4" />
                      ) : (
                        <Power className="h-4 w-4" />
                      )}
                      <span className="sr-only">{item.isActive ? 'Inativar' : 'Ativar'}</span>
                    </AdminButton>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {input.rows.length === 0 ? (
            <TableRow>
              <TableCell className="px-4 py-6 text-muted-foreground" colSpan={6}>
                Nenhum item na agenda.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
