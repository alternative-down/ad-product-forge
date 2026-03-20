import { createId } from '@paralleldrive/cuid2';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '../database/index.js';
import { systemProviders } from '../database/schema.js';
import { decryptSecret, encryptSecret } from '../encryption/crypto.js';

const migaduProviderConfigSchema = z.object({
  apiBaseUrl: z.string().url().default('https://api.migadu.com/v1'),
  apiUser: z.string().email(),
  apiKey: z.string().min(1),
  domain: z.string().min(1),
  imapHost: z.string().default('imap.migadu.com'),
  imapPort: z.number().int().positive().default(993),
  imapSecure: z.boolean().default(true),
  smtpHost: z.string().default('smtp.migadu.com'),
  smtpPort: z.number().int().positive().default(465),
  smtpSecure: z.boolean().default(true),
  bcc: z.string().email().optional(),
});

export type MigaduProviderConfig = z.infer<typeof migaduProviderConfigSchema>;

export function createSystemProviderStore(db: Database) {
  async function getMigadu() {
    const provider = await db.query.systemProviders.findFirst({
      where: eq(systemProviders.providerType, 'migadu'),
    });

    if (!provider) {
      return null;
    }

    const decrypted = decryptSecret(provider.encryptedCredentials);
    return migaduProviderConfigSchema.parse(JSON.parse(decrypted));
  }

  async function setMigadu(config: MigaduProviderConfig) {
    const now = Date.now();
    const encryptedCredentials = encryptSecret(JSON.stringify(migaduProviderConfigSchema.parse(config)));
    const existing = await db.query.systemProviders.findFirst({
      where: eq(systemProviders.providerType, 'migadu'),
    });

    if (existing) {
      await db
        .update(systemProviders)
        .set({
          encryptedCredentials,
          updatedAt: now,
        })
        .where(eq(systemProviders.id, existing.id));

      return;
    }

    await db.insert(systemProviders).values({
      id: createId(),
      providerType: 'migadu',
      encryptedCredentials,
      createdAt: now,
      updatedAt: now,
    });
  }

  return {
    getMigadu,
    setMigadu,
  };
}

export { migaduProviderConfigSchema };
