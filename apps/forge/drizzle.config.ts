import type { Config } from 'drizzle-kit';

import { parseEnv } from './src/config/env';

const env = parseEnv();

export default {
  schema: ['./src/database/schema.ts', './src/finance/payment-schema.ts'],
  out: './migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: env.DATABASE_URL,
    authToken: env.DATABASE_AUTH_TOKEN,
  },
} satisfies Config;
