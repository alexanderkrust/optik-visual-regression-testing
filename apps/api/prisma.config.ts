import { defineConfig } from 'prisma/config';
export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    /* seed: 'tsx prisma/seed.ts', */
  },
  datasource: {
    // Not required for `prisma generate` (e.g. during the Docker build);
    // migrate commands fail with a clear error if it is missing.
    url: process.env.DATABASE_URL ?? '',
  },
});
