/**
 * Set (or reset) a user's password. Needed once for accounts created via Google sign-in.
 * Run with: npx tsx scripts/set-password.ts <email> <new-password>
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../lib/password";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as never);

async function main() {
  const [emailArg, password] = process.argv.slice(2);
  if (!emailArg || !password) throw new Error("Usage: set-password.ts <email> <new-password>");
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);

  const email = emailArg.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user with email ${email}`);

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(password) } });
  await prisma.authSession.deleteMany({ where: { userId: user.id } });
  console.log(`Password set for ${email}; existing sessions revoked.`);
}

main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; }).finally(() => pool.end());
