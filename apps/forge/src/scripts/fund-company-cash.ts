import 'dotenv/config';

import { z } from 'zod';

import { getDatabase, runMigrations } from '../database/index.js';
import { createCompanyCashLedger } from '../finance/company-cash-ledger.js';

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

  await runMigrations(db);
  await companyCash.postEntry({
    type: 'manual-adjustment',
    direction: 'in',
    amountUsd: input.amountUsd,
    description: input.description ?? 'Manual company cash funding',
  });

  const balanceUsd = await companyCash.getCurrentBalanceUsd();

  console.log(`[Cash] Added USD ${input.amountUsd.toFixed(2)}`);
  console.log(`[Cash] Current balance: USD ${balanceUsd.toFixed(2)}`);
}

fundCompanyCash().catch((error) => {
  console.error('[Cash] Failed to fund company cash:', error);
  process.exit(1);
});
