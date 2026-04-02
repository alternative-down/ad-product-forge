import type { ReactNode } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function DataTable(input: {
  columns: Array<{ key: string; label: string; mono?: boolean }>;
  rows: Array<Record<string, ReactNode>>;
  empty?: ReactNode;
}) {
  if (input.rows.length === 0) {
    return input.empty ?? null;
  }

  return (
    <div className="v2-section overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-[color:var(--v2-border)] hover:bg-transparent">
            {input.columns.map((column) => (
              <TableHead
                key={column.key}
                className={column.mono ? 'v2-mono text-[11px] uppercase tracking-[0.08em] text-[color:var(--v2-muted)]' : 'text-[11px] uppercase tracking-[0.08em] text-[color:var(--v2-muted)]'}
              >
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {input.rows.map((row, index) => (
            <TableRow key={index} className="border-[color:var(--v2-border)] hover:bg-white/50">
              {input.columns.map((column) => (
                <TableCell
                  key={column.key}
                  className={column.mono ? 'v2-mono text-sm text-[color:var(--v2-text)]' : 'text-sm text-[color:var(--v2-text)]'}
                >
                  {row[column.key]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
