import { existsSync } from "node:fs";
import { Pool } from "pg";
import { schema } from "../src/lib/schema";
if (existsSync(".env")) process.loadEnvFile(".env");
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL in .env.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(schema);
    console.log("Database schema is up to date.");
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
