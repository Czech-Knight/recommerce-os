import { PGlite } from "@electric-sql/pglite";
import { Pool, type PoolClient } from "pg";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { isDemo } from "./config";
import { schema } from "./schema";

export interface Database {
  close?(): Promise<void>;
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
}
function pgAdapter(client: Pool | PoolClient): Database {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await client.query(sql, params);
      return { rows: r.rows as T[], rowCount: r.rowCount || 0 };
    },
    async transaction<T>(fn: (tx: Database) => Promise<T>) {
      if (!(client instanceof Pool)) return fn(pgAdapter(client));
      const conn = await client.connect();
      try {
        await conn.query("BEGIN");
        const value = await fn(pgAdapter(conn));
        await conn.query("COMMIT");
        return value;
      } catch (error) {
        await conn.query("ROLLBACK");
        throw error;
      } finally {
        conn.release();
      }
    },
  };
}
export async function memoryDatabase(): Promise<Database> {
  const db = new PGlite();
  await db.exec(schema);
  return { ...liteAdapter(db), close: () => db.close() };
}
export function postgresDatabase(
  connectionString: string,
  options?: string,
): Database {
  const pool = new Pool({ connectionString, options, max: 10 });
  return { ...pgAdapter(pool), close: () => pool.end() };
}
function liteAdapter(client: Pick<PGlite, "query" | "transaction">): Database {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await client.query<T>(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
    },
    transaction<T>(fn: (tx: Database) => Promise<T>) {
      return client.transaction((tx) =>
        fn(liteAdapter(tx as unknown as PGlite)),
      );
    },
  };
}
const globalDb = globalThis as unknown as { recommerceDb?: Promise<Database> };
export function getDb(): Promise<Database> {
  return (globalDb.recommerceDb ??= (async () => {
    if (isDemo()) {
      const path = resolve(
        /* turbopackIgnore: true */ process.env.DEMO_DATA_DIR || ".data/demo",
      );
      await mkdir(path, { recursive: true });
      const lite = new PGlite(path);
      await lite.exec(schema);
      const db = liteAdapter(lite);
      const { seed } = await import("./seed");
      await seed(db);
      return db;
    }
    if (!process.env.DATABASE_URL)
      throw new Error("Set DATABASE_URL or explicitly enable DEMO_MODE=true.");
    return postgresDatabase(process.env.DATABASE_URL);
  })());
}
