import { z } from 'zod';
import type { Database } from './lib/db';
import type { HttpServer } from './lib/http-server';
import type { AdminReadModel } from './read-model';
import { parseJsonBody, jsonResponse } from './lib/http';
import { createId } from './lib/id';

// Schemas
const createInvestmentSchema = z.object({
  amountUsd: z.number().positive(),
  description: z.string().optional(),
  effectiveAt: z.string().optional(),
});

const createPayableSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('single'),
    name: z.string().min(1),
    description: z.string().optional(),
    amountUsd: z.number().positive(),
    dueAt: z.string().min(1),
  }),
  z.object({
    kind: z.literal('recurring'),
    name: z.string().min(1),
    description: z.string().optional(),
    amountUsd: z.number().positive(),
    recurrencePeriod: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']),
    dueAt: z.string().min(1),
  }),
]);

const ledgerEntryActionSchema = z.object({
  entryId: z.string().min(1),
  effectiveAt: z.string().optional(),
});

const recurringPayableStatusSchema = z.object({
  payableId: z.string().min(1),
  isActive: z.boolean(),
});

export function registerFinanceRoutes(input: {
  db: Database;
  httpServer: HttpServer;
  readModel: AdminReadModel;
  companyCash: {
    recordCashIn: (data: {
      type: string;
      amountUsd: number;
      description: string;
      effectiveAt: number;
    }) => Promise<void>;
    scheduleCashOut: (data: {
      type: string;
      amountUsd: number;
      description: string;
      referenceType: string;
      referenceId: string;
      dueAt: number;
    }) => Promise<{ entryId: string }>;
    postPlannedEntry: (entryId: string, opts?: { effectiveAt?: number }) => Promise<void>;
    cancelPlannedEntry: (entryId: string) => Promise<void>;
  };
  companyPayables: {
    createRecurringPayable: (data: {
      name: string;
      description: string | undefined;
      amountUsd: number;
      recurrencePeriod: string;
      dueAt: number;
    }) => Promise<{ payableId: string; entryId: string }>;
    cancelLedgerEntry: (entryId: string, effectiveAt?: number) => Promise<void>;
    setRecurringPayableActive: (payableId: string, isActive: boolean) => Promise<void>;
    syncRecurringPayableOccurrence: (data: { entryId: string }) => Promise<void>;
  };
}) {
  const { companyCash, companyPayables, readModel } = input;

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance',
    handler: async () => jsonResponse(await readModel.getFinance()),
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/investment/create',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, createInvestmentSchema);
      const effectiveAt = body.effectiveAt ? new Date(body.effectiveAt).getTime() : Date.now();

      await companyCash.recordCashIn({
        type: 'owner-investment',
        amountUsd: body.amountUsd,
        description: body.description ?? 'Manual owner investment',
        effectiveAt,
      });

      return jsonResponse({ success: true });
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/payable/create',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, createPayableSchema);
      const dueAt = new Date(body.dueAt).getTime();

      if (!Number.isFinite(dueAt)) {
        throw new Error('Invalid payable dueAt');
      }

      if (body.kind === 'single') {
        const result = await companyCash.scheduleCashOut({
          type: 'manual-payable',
          amountUsd: body.amountUsd,
          description: body.description ?? body.name,
          referenceType: 'manual-payable',
          referenceId: createId(),
          dueAt,
        });

        return jsonResponse({
          kind: body.kind,
          entryId: result.entryId,
        }, 201);
      }

      const result = await companyPayables.createRecurringPayable({
        name: body.name,
        description: body.description,
        amountUsd: body.amountUsd,
        recurrencePeriod: body.recurrencePeriod,
        dueAt,
      });

      return jsonResponse({
        kind: body.kind,
        payableId: result.payableId,
        entryId: result.entryId,
      }, 201);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/ledger/post',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, ledgerEntryActionSchema);
      const effectiveAt = body.effectiveAt ? new Date(body.effectiveAt).getTime() : undefined;
      const result = await companyCash.postPlannedEntry(body.entryId, { effectiveAt });

      await companyPayables.syncRecurringPayableOccurrence({
        entryId: body.entryId,
      });

      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/ledger/cancel',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, ledgerEntryActionSchema);
      const result = await companyCash.cancelPlannedEntry(body.entryId);

      await companyPayables.syncRecurringPayableOccurrence({
        entryId: body.entryId,
      });

      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/recurring-payable/set-active',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, recurringPayableStatusSchema);
      const result = await companyPayables.setRecurringPayableActive(body.payableId, body.isActive);
      return jsonResponse(result);
    },
  });
}
