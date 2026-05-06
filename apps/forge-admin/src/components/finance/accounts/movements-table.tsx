import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { humanizeMovementStatus, humanizeMovementType, formatDateTime, formatUsdSigned } from './finance-accounts-format';

export function MovementsTable(input: {
  movements: Array<{
    id: string;
    type: string;
    amountUsd: number;
    direction: 'in' | 'out';
    effectiveAt: number | null;
    dueAt: number | null;
    createdAt: number;
    status: string;
  }>;
}) {
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-sm border border-border">
      <Table className="text-sm">
        <TableHeader className="bg-muted/50 text-left text-muted-foreground">
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-4 py-3 font-medium">Nome</TableHead>
            <TableHead className="px-4 py-3 font-medium">Valor</TableHead>
            <TableHead className="px-4 py-3 font-medium">Data</TableHead>
            <TableHead className="px-4 py-3 font-medium">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {input.movements.map((movement) => (
            <TableRow key={movement.id}>
              <TableCell className="px-4 py-3">{humanizeMovementType(movement.type)}</TableCell>
              <TableCell className="px-4 py-3">{formatUsdSigned(movement.amountUsd, movement.direction)}</TableCell>
              <TableCell className="px-4 py-3">
                {formatDateTime(movement.effectiveAt ?? movement.dueAt ?? movement.createdAt)}
              </TableCell>
              <TableCell className="px-4 py-3">{humanizeMovementStatus(movement.status)}</TableCell>
            </TableRow>
          ))}
          {input.movements.length === 0 ? (
            <TableRow>
              <TableCell className="px-4 py-6 text-muted-foreground" colSpan={4}>
                Nenhum movimento ainda.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
