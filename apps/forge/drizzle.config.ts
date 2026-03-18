import type { Config } from 'drizzle-kit';

export default {
  schema: './src/database/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'file:./agents.db',
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
} satisfies Config;
