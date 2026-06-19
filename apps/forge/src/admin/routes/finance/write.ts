/**
 * Finance Admin Write Routes - Extracted from routes.ts
 * POST routes for finance operations (investment, payable, ledger, recurring)
 */

import { z, ZodError } from 'zod';

import type { HttpRequest, HttpHandler } from '../../../http/server';
import { adminRouteError } from '../agents/admin-route-error-helper';
import { jsonResponse, parseJsonBody } from '../index';
import { createId } from '../../../utils/id';

const createInvestmentSchema = z
  .object({
    amountUsd: z.number().positive(),
    description: z.string().optional(),
    effectiveAt: z.string().optional(),
  })
  .strict();

const createPayableSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    amountUsd: z.number().positive(),
    dueAt: z.string(),
    kind: z.enum(['single', 'recurring']),
    recurrencePeriod: z.enum(['weekly', 'monthly', 'yearly']).optional(),
  })
  .strict();

const ledgerEntryActionSchema = z
  .object({
    entryId: z.string().min(1),
    effectiveAt: z.string().optional(),
  })
  .strict();

const recurringPayableStatusSchema = z
  .object({
    payableId: z.string(),
    isActive: z.boolean(),
  })
  .strict();

type CompanyCash = {
  recordCashIn: (input: {
    type: string;
    amountUsd: number;
    description: string;
    effectiveAt?: number;
  }) => Promise<{ entryId: string }>;
  scheduleCashOut: (input: {
    type: string;
    amountUsd: number;
    description: string;
    referenceType: string;
    referenceId: string;
    dueAt: number;
  }) => Promise<{ entryId: string }>;
  postPlannedEntry: (entryId: string, opts?: { effectiveAt?: number }) => Promise<unknown>;
  cancelPlannedEntry: (entryId: string) => Promise<unknown>;
};

type CompanyPayables = {
  createRecurringPayable: (input: {
    name: string;
    description?: string;
    amountUsd: number;
    recurrencePeriod: 'weekly' | 'monthly' | 'yearly';
    dueAt: number;
  }) => Promise<{ payableId: string; entryId: string }>;
  syncRecurringPayableOccurrence: (input: {
    entryId: string;
  }) => Promise<{ payableId: string; nextDueAt: number } | null>;
  listRecurringPayables: () => Promise<
    {
      payableId: string;
      name: string;
      description: string | undefined;
      amountUsd: number;
      recurrencePeriod: 'weekly' | 'monthly' | 'yearly';
      isActive: boolean;
      createdAt: number;
      updatedAt: number;
      nextDueAt: number;
    }[]
  >;
  setRecurringPayableActive: (
    payableId: string,
    isActive: boolean,
  ) => Promise<{ payableId: string }>;
};

type FinanceWriteInput = {
  companyCash: CompanyCash;
  companyPayables: CompanyPayables;
} | any;

/**
 * Register POST routes for finance write operations
 */
export function registerFinanceWriteRoutes(
  httpServer: {
    registerRoute: (route: {
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      path: string;
      handler: HttpHandler;
    }) => void;
  },
  input: FinanceWriteInput,
) {
  // POST /admin/finance/investment/create
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/investment/create',
    handler: async (request: HttpRequest) => {
      try {
        const body = parseJsonBody(request.bodyText, createInvestmentSchema);
        const effectiveAt =
          body.effectiveAt !== null && body.effectiveAt !== undefined
            ? new Date(body.effectiveAt).getTime()
            : Date.now();

        await input.companyCash.recordCashIn({
          type: 'owner-investment',
          amountUsd: body.amountUsd,
          description: body.description ?? 'Manual owner investment',
          effectiveAt,
        });

        return jsonResponse({ success: true });
      } catch (err) {
        if (err instanceof ZodError) throw err;
        if (err instanceof Error && err.message.startsWith('Invalid')) throw err;
        return adminRouteError(err, { path: '/admin/finance/investment/create' });
      }
    },
  });

  // POST /admin/finance/payable/create
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/payable/create',
    handler: async (request: HttpRequest) => {
      try {
        const body = parseJsonBody(request.bodyText, createPayableSchema);
        const dueAt = new Date(body.dueAt).getTime();

        if (!Number.isFinite(dueAt)) {
          throw new Error('Invalid payable dueAt');
        }

        if (body.kind === 'single') {
          const result = await input.companyCash.scheduleCashOut({
            type: 'manual-payable',
            amountUsd: body.amountUsd,
            description: body.description ?? body.name,
            referenceType: 'manual-payable',
            referenceId: createId(),
            dueAt,
          });

          return jsonResponse(
            {
              kind: body.kind,
              entryId: result.entryId,
            },
            201,
          );
        }

        const result = await input.companyPayables.createRecurringPayable({
          name: body.name,
          description: body.description,
          amountUsd: body.amountUsd,
          recurrencePeriod: body.recurrencePeriod ?? 'monthly',
          dueAt,
        });

        return jsonResponse(
          {
            kind: body.kind,
            payableId: result.payableId,
            entryId: result.entryId,
          },
          201,
        );
      } catch (err) {
        if (err instanceof ZodError) throw err;
        if (err instanceof Error && err.message.startsWith('Invalid')) throw err;
        return adminRouteError(err, { path: '/admin/finance/payable/create' });
      }
    },
  });

  // POST /admin/finance/ledger/post
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/ledger/post',
    handler: async (request: HttpRequest) => {
      try {
        const body = parseJsonBody(request.bodyText, ledgerEntryActionSchema);
        const effectiveAt =
          body.effectiveAt !== null && body.effectiveAt !== undefined
            ? new Date(body.effectiveAt).getTime()
            : undefined;
        const result = await input.companyCash.postPlannedEntry(body.entryId, { effectiveAt });

        await input.companyPayables.syncRecurringPayableOccurrence({
          entryId: body.entryId,
        });

        return jsonResponse(result);
      } catch (err) {
        if (err instanceof ZodError) throw err;
        return adminRouteError(err, { path: '/admin/finance/ledger/post' });
      }
    },
  });

  // POST /admin/finance/ledger/cancel
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/ledger/cancel',
    handler: async (request: HttpRequest) => {
      try {
        const body = parseJsonBody(request.bodyText, ledgerEntryActionSchema);
        const result = await input.companyCash.cancelPlannedEntry(body.entryId);

        await input.companyPayables.syncRecurringPayableOccurrence({
          entryId: body.entryId,
        });

        return jsonResponse(result);
      } catch (err) {
        if (err instanceof ZodError) throw err;
        return adminRouteError(err, { path: '/admin/finance/ledger/cancel' });
      }
    },
  });

  // POST /admin/finance/recurring-payable/set-active
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/recurring-payable/set-active',
    handler: async (request: HttpRequest) => {
      try {
        const body = parseJsonBody(request.bodyText, recurringPayableStatusSchema);
        const result = await input.companyPayables.setRecurringPayableActive(
          body.payableId,
          body.isActive,
        );
        return jsonResponse(result);
      } catch (err) {
        if (err instanceof ZodError) throw err;
        return adminRouteError(err, { path: '/admin/finance/recurring-payable/set-active' });
      }
    },
  });
}
