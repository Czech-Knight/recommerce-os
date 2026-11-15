import { PGlite } from "@electric-sql/pglite";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// Build an empty Postgres cluster before entering the small demo runtime.
// Application schema and sample records are still created by getDb() on startup.
const directory = process.argv[2];
if (!directory) throw new Error("Provide a new demo database directory.");
const target = resolve(directory);
await mkdir(dirname(target), { recursive: true });
await mkdir(target); // Refuse to reuse or overwrite an existing database.
const database = new PGlite(target);
try {
  await database.waitReady;
} finally {
  await database.close();
}
console.log("Empty demo database prepared.");
