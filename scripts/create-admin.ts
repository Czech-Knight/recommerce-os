import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { hashPassword } from "../src/lib/auth";
if (existsSync(".env")) process.loadEnvFile(".env");
async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase(),
    password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12)
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters).",
    );
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(
      "INSERT INTO users(id,name,email,password_hash,role,status) VALUES($1,'Workspace Admin',$2,$3,'admin','active')",
      [randomUUID(), email, hashPassword(password)],
    );
    console.log("Admin created. Remove ADMIN_PASSWORD from your environment.");
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(
    error.code === "23505"
      ? "This email already exists. No account was modified."
      : error.message,
  );
  process.exitCode = 1;
});
