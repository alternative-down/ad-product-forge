import 'dotenv/config';
import { forgeDebug } from '@forge-runtime/core';

import { z } from 'zod';


import { getDatabase } from '../database/client';
import { runMigrations } from '../database/migrate';
import { createCompanyCashLedger } from '../finance/company-cash-ledger';
import { createCompanyCashOperations } from '../finance/company-cash-operations';

const cliInputSchema = z.object({
  amountUsd: z.coerce.number().positive(),
  description: z.string().optional(),
});

async function fundCompanyCash() {
  const input = cliInputSchema.parse({
    amountUsd: process.argv[2],
    description: process.argv[3],
  });
  const db = getDatabase();
  const companyCash = createCompanyCashLedger(db);
  const companyCashOperations = createCompanyCashOperations(db);

  await runMigrations(db);
  await companyCashOperations.recordCashIn({
    type: 'manual-adjustment',
    amountUsd: input.amountUsd,
    description: input.description ?? 'Manual company cash funding',
  });

  const balanceUsd = await companyCash.getCurrentBalanceUsd();

  forgeDebug({ scope: 'fund-cash', level: 'info', message: 'Added company cash', context: { amountUsd: input.amountUsd } });
  // Balance logged above via forgeDebug
}

fundCompanyCash().catch((error) => {
  forgeDebug({ scope: 'fund-cash', level: 'error', message: 'Failed to fund company cash', context: { amountUsd: input.amountUsd, error } });
  process.exit(1);
});
