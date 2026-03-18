import type { Config } from 'drizzle-kit';

export default {
  schema: './src/agent/communication/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'file:./communication.db',
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
} satisfies Config;
