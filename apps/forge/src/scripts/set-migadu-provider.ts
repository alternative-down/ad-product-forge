import 'dotenv/config';

import { z } from 'zod';

import { getDatabase, runMigrations } from '../database/index.js';
import { createSystemProviderStore, migaduProviderConfigSchema } from '../providers/system-provider-store.js';

const argvSchema = z.object({
  apiUser: z.string().email(),
  apiKey: z.string().min(1),
  domain: z.string().min(1),
  apiBaseUrl: z.string().url().default('https://api.migadu.com/v1'),
  imapHost: z.string().default('imap.migadu.com'),
  imapPort: z.coerce.number().int().positive().default(993),
  imapSecure: z.enum(['true', 'false']).transform((value) => value === 'true').default('true'),
  smtpHost: z.string().default('smtp.migadu.com'),
  smtpPort: z.coerce.number().int().positive().default(465),
  smtpSecure: z.enum(['true', 'false']).transform((value) => value === 'true').default('true'),
  bcc: z.string().email().optional(),
});

async function main() {
  const args = argvSchema.parse({
    apiUser: process.argv[2],
    apiKey: process.argv[3],
    domain: process.argv[4],
    apiBaseUrl: process.argv[5],
    imapHost: process.argv[6],
    imapPort: process.argv[7],
    imapSecure: process.argv[8],
    smtpHost: process.argv[9],
    smtpPort: process.argv[10],
    smtpSecure: process.argv[11],
    bcc: process.argv[12],
  });

  const db = getDatabase();
  await runMigrations(db);

  const providers = createSystemProviderStore(db);
  await providers.setMigadu(migaduProviderConfigSchema.parse(args));

  console.log('[Migadu] Provider config saved to system_providers');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
