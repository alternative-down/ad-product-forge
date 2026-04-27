/**
 * Finance Admin Write Routes - Extracted from routes.ts
 * POST routes for finance operations (investment, payable, ledger, recurring)
 */

import { z } from 'zod';
import type { HttpRequest } from '../../../http/server';
import { jsonResponse, parseJsonBody } from '../index';
import { createId } from '../../../utils/id.js';

const createInvestmentSchema = z.object({
  amountUsd: z.number().positive(),
  description: z.string().optional(),
  effectiveAt: z.string().optional(),
}).strict();

const createPayableSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  amountUsd: z.number().positive(),
  dueAt: z.string(),
  kind: z.enum(['single', 'recurring']),
  recurrencePeriod: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
}).strict();

const ledgerEntryActionSchema = z.object({
  entryId: z.string().min(1),
  effectiveAt: z.string().optional(),
}).strict();

const recurringPayableStatusSchema = z.object({
  payableId: z.string(),
  isActive: z.boolean(),
}).strict();

interface CompanyCash {
  recordCashIn: (opts: { type: string; amountUsd: number; description: string; effectiveAt: number }) => Promise<void>;
  scheduleCashOut: (opts: { type: string; amountUsd: number; description: string; referenceType: string; referenceId: string; dueAt: number }) => Promise<{ entryId: string }>;
  postPlannedEntry: (entryId: string, opts: { effectiveAt?: number }) => Promise<unknown>;
  cancelPlannedEntry: (entryId: string) => Promise<unknown>;
}

interface CompanyPayables {
  createRecurringPayable: (opts: { name: string; description?: string; amountUsd: number; recurrencePeriod: string; dueAt: number }) => Promise<{ payableId: string; entryId: string }>;
  syncRecurringPayableOccurrence: (opts: { entryId: string }) => Promise<void>;
  setRecurringPayableActive: (payableId: string, isActive: boolean) => Promise<unknown>;
}

interface FinanceWriteInput {
  companyCash: CompanyCash;
  companyPayables: CompanyPayables;
}

/**
 * Register POST routes for finance write operations
 */
export function registerFinanceWriteRoutes(
  httpServer: { registerRoute: (route: unknown) => void },
  input: FinanceWriteInput
) {
  // POST /admin/finance/investment/create
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/investment/create',
    handler: async (request: HttpRequest) => {
      const body = parseJsonBody(request.bodyText, createInvestmentSchema);
      const effectiveAt = body.effectiveAt ? new Date(body.effectiveAt).getTime() : Date.now();

      await input.companyCash.recordCashIn({
        type: 'owner-investment',
        amountUsd: body.amountUsd,
        description: body.description ?? 'Manual owner investment',
        effectiveAt,
      });

      return jsonResponse({ success: true });
    },
  });

  // POST /admin/finance/payable/create
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/payable/create',
    handler: async (request: HttpRequest) => {
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

        return jsonResponse({
          kind: body.kind,
          entryId: result.entryId,
        }, 201);
      }

      const result = await input.companyPayables.createRecurringPayable({
        name: body.name,
        description: body.description,
        amountUsd: body.amountUsd,
        recurrencePeriod: body.recurrencePeriod ?? 'monthly',
        dueAt,
      });

      return jsonResponse({
        kind: body.kind,
        payableId: result.payableId,
        entryId: result.entryId,
      }, 201);
    },
  });

  // POST /admin/finance/ledger/post
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/ledger/post',
    handler: async (request: HttpRequest) => {
      const body = parseJsonBody(request.bodyText, ledgerEntryActionSchema);
      const effectiveAt = body.effectiveAt ? new Date(body.effectiveAt).getTime() : undefined;
      const result = await input.companyCash.postPlannedEntry(body.entryId, { effectiveAt });

      await input.companyPayables.syncRecurringPayableOccurrence({
        entryId: body.entryId,
      });

      return jsonResponse(result);
    },
  });

  // POST /admin/finance/ledger/cancel
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/ledger/cancel',
    handler: async (request: HttpRequest) => {
      const body = parseJsonBody(request.bodyText, ledgerEntryActionSchema);
      const result = await input.companyCash.cancelPlannedEntry(body.entryId);

      await input.companyPayables.syncRecurringPayableOccurrence({
        entryId: body.entryId,
      });

      return jsonResponse(result);
    },
  });

  // POST /admin/finance/recurring-payable/set-active
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/recurring-payable/set-active',
    handler: async (request: HttpRequest) => {
      const body = parseJsonBody(request.bodyText, recurringPayableStatusSchema);
      const result = await input.companyPayables.setRecurringPayableActive(body.payableId, body.isActive);
      return jsonResponse(result);
    },
  });
}