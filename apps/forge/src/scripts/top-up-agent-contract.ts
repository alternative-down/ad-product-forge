import 'dotenv/config';

import { z } from 'zod';

import { getDatabase, runMigrations } from '../database/index.js';
import { topUpActiveAgentContract } from '../agents/top-up-agent-contract.js';

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

  console.log(`[Contract] Top-up applied to ${result.agentId}`);
  console.log(`[Contract] Active contract: ${result.contractId}`);
  console.log(`[Contract] New budget: USD ${result.budgetUsd.toFixed(2)}`);
}

main().catch((error) => {
  console.error('[Contract] Failed to top up active contract:', error);
  process.exit(1);
});
