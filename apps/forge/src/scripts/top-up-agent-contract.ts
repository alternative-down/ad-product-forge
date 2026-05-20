import 'dotenv/config';
import { forgeDebug } from '@forge-runtime/core';

import { z } from 'zod';

import { getDatabase } from '../database/client';
import { runMigrations } from '../database/migrate';
import { topUpActiveAgentContract } from '../agents/top-up-agent-contract';

const cliInputSchema = z.object({
  agentId: z.string().min(1),
  amountUsd: z.coerce.number().positive(),
});

async function main() {
  const input = cliInputSchema.parse({
    agentId: process.argv[2],
    amountUsd: process.argv[3],
  });
  const db = getDatabase();

  await runMigrations(db);

  const result = await topUpActiveAgentContract(db, input);

  forgeDebug({
    scope: 'top-up-contract',
    level: 'info',
    message: 'Top-up applied',
    context: {
      agentId: result.agentId,
      contractId: result.contractId,
      budgetUsd: result.budgetUsd,
    },
  });
  // Contract info logged above via forgeDebug
  // Budget info logged above via forgeDebug
}

main().catch((error) => {
  forgeDebug({
    scope: 'top-up-contract',
    level: 'error',
    message: 'Failed to top up active contract',
    context: { error: error instanceof Error ? error.message : String(error) },
  });
  process.exit(1);
});
