import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * URL shadow database untuk `prisma migrate diff --from-migrations` (drift check).
 *
 * Default: database terpisah di server yang sama (`<nama>_shadow`), sehingga
 * developer tidak perlu menyiapkan apa pun — Prisma membuat dan menghapusnya
 * sendiri. Override lewat SHADOW_DATABASE_URL bila server melarang CREATEDB.
 */
function shadowDatabaseUrl(databaseUrl: string): string {
  if (process.env.SHADOW_DATABASE_URL) {
    return process.env.SHADOW_DATABASE_URL;
  }
  const url = new URL(databaseUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}_shadow`;
  return url.toString();
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: env("DATABASE_URL"),
    shadowDatabaseUrl: shadowDatabaseUrl(env("DATABASE_URL")),
  },
});
