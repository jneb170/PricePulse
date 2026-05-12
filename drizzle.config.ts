import type { Config } from 'drizzle-kit';

export default {
  schema: './src/server/db/schema/index.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/dev.db',
  },
  verbose: true,
  strict: true,
} satisfies Config;
