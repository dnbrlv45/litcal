import { defineConfig } from "@prisma/config";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env and .env.local so DATABASE_URL / DIRECT_URL are available to the CLI.
// Next.js handles its own env loading at runtime — this is only for Prisma CLI commands.
dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, ".env.local"), override: true });

// prisma.config.ts is used by the Prisma CLI for migrations and introspection.
// Connection URLs live here (not in schema.prisma) — required by Prisma v7+.
//
// DIRECT_URL must be a direct (non-pooled) Supabase connection for migrations.
// For runtime queries, lib/prisma.ts uses the pooled DATABASE_URL via PrismaPg adapter.
export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
