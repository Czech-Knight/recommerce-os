import { processProductSync } from "./lib/catalog";
import { existsSync } from "node:fs";
import { Queue, Worker } from "bullmq";
import { getDb } from "./lib/db";
import { processWebhook, restoreOrder } from "./lib/engine";
import { processOutbox } from "./lib/shopify";
import { isDemo, required } from "./lib/config";

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  if (isDemo())
    throw new Error(
      "The worker requires DEMO_MODE=false, PostgreSQL and Redis. Demo jobs run in the web process.",
    );
  const redis = new URL(required("REDIS_URL"));
  const connection = {
    host: redis.hostname,
    port: Number(redis.port || 6379),
    username: decodeURIComponent(redis.username) || undefined,
    password: decodeURIComponent(redis.password) || undefined,
    db: Number(redis.pathname.slice(1) || 0),
    ...(redis.protocol === "rediss:" ? { tls: {} } : {}),
  };
  const queue = new Queue("recommerce-events", { connection });
  queue.on("error", (error) =>
    console.error("Queue connection error", error.message),
  );
  const db = await getDb();
  const worker = new Worker(
    "recommerce-events",
    async (job) => {
      if (job.name === "webhook") await processWebhook(db, job.data.id);
      else {
        const row = (
          await db.query<{ kind: string }>(
            "SELECT kind FROM outbox WHERE id=$1",
            [job.data.id],
          )
        ).rows[0];
        if (row?.kind === "product.sync")
          await processProductSync(db, job.data.id);
        else await processOutbox(db, job.data.id);
      }
    },
    { connection, concurrency: 4 },
  );
  worker.on("failed", (job, error) =>
    console.error("Job failed", { id: job?.id, message: error.message }),
  );
  worker.on("error", (error) =>
    console.error("Worker connection error", error.message),
  );
  let busy = false;
  async function dispatch() {
    if (busy) return;
    busy = true;
    try {
      // DB inbox/outbox is authoritative. If Redis is lost, all unfinished work is rediscovered.
      for (const [table, kind] of [
        ["webhook_events", "webhook"],
        ["outbox", "inventory"],
      ] as const) {
        const rows = await db.query<{ id: string }>(
          `SELECT id FROM ${table} WHERE status='pending' OR (status='failed' AND attempts<5) ORDER BY created_at LIMIT 100`,
        );
        for (const row of rows.rows)
          await queue.add(
            kind,
            { id: row.id },
            {
              jobId: row.id,
              attempts: 5,
              backoff: { type: "exponential", delay: 2000 },
              removeOnComplete: true,
              removeOnFail: true,
            },
          );
      }
      const expired = await db.query<{ id: string; customer_id: string }>(
        "SELECT id,customer_id FROM orders WHERE source='marketplace' AND status='awaiting_payment' AND created_at<now()-interval '30 minutes' LIMIT 50",
      );
      for (const order of expired.rows)
        await db.transaction(async (tx) => {
          const current = (
            await tx.query<{ status: string }>(
              "SELECT status FROM orders WHERE id=$1 FOR UPDATE",
              [order.id],
            )
          ).rows[0];
          if (current?.status === "awaiting_payment")
            await restoreOrder(
              tx,
              order.id,
              "unpaid reservation expired",
              order.customer_id,
            );
        });
    } catch (error) {
      console.error(
        "Dispatch failed",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      busy = false;
    }
  }
  await dispatch();
  const timer = setInterval(dispatch, 5000);
  console.log(
    "ReCommerce worker ready; inbox/outbox recovery runs every 5 seconds.",
  );
  async function shutdown() {
    clearInterval(timer);
    await worker.close();
    await queue.close();
    await db.close?.();
    process.exit(0);
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
