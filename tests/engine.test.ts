import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { memoryDatabase, postgresDatabase, type Database } from "../src/lib/db";
import { Pool } from "pg";
import { schema } from "../src/lib/schema";
import { seed } from "../src/lib/seed";
import {
  acceptWebhook,
  processWebhook,
  checkout,
  restoreOrder,
} from "../src/lib/engine";
import { state } from "../src/lib/state";
import {
  hashPassword,
  verifyPassword,
  requireRole,
  sameOrigin,
} from "../src/lib/auth";
import {
  encryptToken,
  decryptToken,
  verifyWebhook,
  verifyOAuth,
  validShop,
  graphql,
  shopConnection,
  processOutbox,
} from "../src/lib/shopify";
import { exportDraft, processProductSync } from "../src/lib/catalog";
import type { User } from "../src/lib/types";
process.env.DEMO_MODE = "true";
let db: Database;
let cleanup: (() => Promise<void>) | undefined;
const customer: User = {
  id: "demo-customer",
  name: "Jamie Lee",
  email: "customer@recommerce.demo",
  role: "customer",
  status: "active",
};
const payload = (id: string, quantity = 1) => ({
  id,
  currency: "AUD",
  financial_status: "paid",
  line_items: [{ variant_id: 1001, quantity, price: "59.00" }],
});
const stock = async () =>
  (
    await db.query<{ stock: number }>(
      "SELECT stock FROM products WHERE id='linen-shirt'",
    )
  ).rows[0].stock;
const count = async (table: string) =>
  (await db.query<{ n: number }>(`SELECT count(*)::int n FROM ${table}`))
    .rows[0].n;
const cart = (items = [{ productId: "canvas-tote", quantity: 1 }]) => ({
  key: randomUUID(),
  items,
  name: "Jamie Lee",
  address: "1 Test Street, Melbourne VIC 3000",
  discount: "",
});
before(async () => {
  if (process.env.TEST_DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const name = `rc_test_${randomUUID().replaceAll("-", "")}`;
    await pool.query(`CREATE SCHEMA "${name}"`);
    db = postgresDatabase(
      process.env.TEST_DATABASE_URL,
      `-c search_path=${name}`,
    );
    await db.query(schema);
    cleanup = async () => {
      await pool.query(`DROP SCHEMA "${name}" CASCADE`);
      await pool.end();
    };
  } else db = await memoryDatabase();
  await seed(db);
});
after(async () => {
  await db.close?.();
  await cleanup?.();
});
test("signed webhook verification rejects tampering and malformed signatures", () => {
  const raw = JSON.stringify(payload("signed"));
  const signature = createHmac("sha256", "secret").update(raw).digest("base64");
  assert.equal(verifyWebhook(raw, signature, "secret"), true);
  assert.equal(verifyWebhook(raw + " ", signature, "secret"), false);
  assert.equal(verifyWebhook(raw, "nope", "secret"), false);
});
test("duplicate event delivery and different event IDs for one order reduce stock exactly once", async () => {
  const id = randomUUID(),
    before = await stock(),
    orders = await count("orders"),
    notifications = await count("notifications");
  const first = await acceptWebhook(
    db,
    "demo-shop",
    id,
    "orders/create",
    payload(id),
  );
  const duplicate = await acceptWebhook(
    db,
    "demo-shop",
    id,
    "orders/create",
    payload(id),
  );
  assert.equal(first.id, duplicate.id);
  assert.equal(duplicate.duplicate, true);
  await Promise.all([
    processWebhook(db, first.id),
    processWebhook(db, first.id),
  ]);
  const replay = await acceptWebhook(
    db,
    "demo-shop",
    randomUUID(),
    "orders/create",
    payload(id),
  );
  await processWebhook(db, replay.id);
  assert.equal(await stock(), before - 1);
  assert.equal(await count("orders"), orders + 1);
  assert.equal(await count("notifications"), notifications + 1);
  const movements = await db.query<{ n: number }>(
    "SELECT count(*)::int n FROM inventory_movements WHERE reason='Shopify order'",
  );
  assert.equal(movements.rows[0].n, 1);
  assert.equal(
    await count("outbox"),
    0,
    "Shopify stock must not be reduced twice at the source store",
  );
});
test("orders/paid arriving before orders/create stays idempotent", async () => {
  const id = randomUUID(),
    before = await stock();
  const paid = await acceptWebhook(
    db,
    "demo-shop",
    id,
    "orders/paid",
    payload(id),
  );
  const created = await acceptWebhook(
    db,
    "demo-shop",
    id,
    "orders/create",
    payload(id),
  );
  await processWebhook(db, paid.id);
  await processWebhook(db, created.id);
  assert.equal(await stock(), before - 1);
});
test("insufficient inventory rolls back order, ledger and notifications; retry recovers", async () => {
  const before = await stock(),
    orders = await count("orders"),
    notifications = await count("notifications"),
    movements = await count("inventory_movements");
  const event = await acceptWebhook(
    db,
    "demo-shop",
    randomUUID(),
    "orders/create",
    payload(randomUUID(), before + 1),
  );
  await assert.rejects(
    () => processWebhook(db, event.id),
    /Insufficient stock/,
  );
  assert.equal(await stock(), before);
  assert.equal(await count("orders"), orders);
  assert.equal(await count("notifications"), notifications);
  assert.equal(await count("inventory_movements"), movements);
  assert.equal(
    (
      await db.query<{ status: string }>(
        "SELECT status FROM webhook_events WHERE id=$1",
        [event.id],
      )
    ).rows[0].status,
    "failed",
  );
  await db.query("UPDATE products SET stock=stock+1 WHERE id='linen-shirt'");
  await processWebhook(db, event.id);
  assert.equal(await stock(), 0);
  await db.query("UPDATE products SET stock=12 WHERE id='linen-shirt'");
});
test("concurrent checkouts cannot oversell the last unit", async () => {
  await db.query("UPDATE products SET stock=1 WHERE id='canvas-tote'");
  const results = await Promise.allSettled([
    checkout(db, customer, cart()),
    checkout(db, { ...customer, id: "demo-admin" }, cart()),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  assert.equal(
    (
      await db.query<{ stock: number }>(
        "SELECT stock FROM products WHERE id='canvas-tote'",
      )
    ).rows[0].stock,
    0,
  );
});
test("checkout retries reuse one order; key reuse with changed cart is rejected", async () => {
  await db.query("UPDATE products SET stock=10 WHERE id='canvas-tote'");
  const input = cart(),
    first = await checkout(db, customer, input),
    second = await checkout(db, customer, input);
  assert.equal(first.id, second.id);
  assert.equal(second.duplicate, true);
  await assert.rejects(
    () =>
      checkout(db, customer, {
        ...input,
        items: [{ productId: "canvas-tote", quantity: 2 }],
      }),
    /different cart/,
  );
});
test("price and discount are computed on the server; repeated cart lines aggregate", async () => {
  const input = cart([
    { productId: "canvas-tote", quantity: 1 },
    { productId: "canvas-tote", quantity: 2 },
  ]);
  const result = await checkout(db, customer, {
    ...input,
    discount: "secondchance",
    total_cents: 1,
  });
  const order = (
    await db.query<{ total_cents: number; discount_cents: number }>(
      "SELECT total_cents,discount_cents FROM orders WHERE id=$1",
      [result.id],
    )
  ).rows[0];
  assert.equal(order.total_cents, 9450);
  assert.equal(order.discount_cents, 1050);
  const line = (
    await db.query<{ quantity: number }>(
      "SELECT quantity FROM order_items WHERE order_id=$1",
      [result.id],
    )
  ).rows[0];
  assert.equal(line.quantity, 3);
});
test("multi-line failure leaves every product stock unchanged", async () => {
  await db.query("UPDATE products SET stock=0 WHERE id='wool-blazer'");
  const initial = (
    await db.query<{ stock: number }>(
      "SELECT stock FROM products WHERE id='canvas-tote'",
    )
  ).rows[0].stock;
  await assert.rejects(() =>
    checkout(
      db,
      customer,
      cart([
        { productId: "canvas-tote", quantity: 1 },
        { productId: "wool-blazer", quantity: 1 },
      ]),
    ),
  );
  assert.equal(
    (
      await db.query<{ stock: number }>(
        "SELECT stock FROM products WHERE id='canvas-tote'",
      )
    ).rows[0].stock,
    initial,
  );
});
test("restoring an order twice cannot duplicate stock", async () => {
  await db.query("UPDATE products SET stock=8 WHERE id='canvas-tote'");
  const order = await checkout(db, customer, cart());
  await db.transaction((tx) =>
    restoreOrder(tx, order.id, "return approved", "demo-admin"),
  );
  await db.transaction((tx) =>
    restoreOrder(tx, order.id, "return approved", "demo-admin"),
  );
  assert.equal(
    (
      await db.query<{ stock: number }>(
        "SELECT stock FROM products WHERE id='canvas-tote'",
      )
    ).rows[0].stock,
    8,
  );
});
test("seller order data is scoped and does not leak customer address or other seller items", async () => {
  const seller: User = { ...customer, id: "demo-seller", role: "seller" };
  const result = await state(db, seller);
  assert.ok(result.orders.length > 0);
  for (const order of result.orders) {
    assert.ok(order.items.every((i) => i.seller_id === seller.id));
    assert.equal("address" in order, false);
    assert.equal(order.customer_name, "Marketplace customer");
  }
  assert.equal(result.sellers.length, 0);
  assert.equal(result.shops.length, 0);
  assert.equal(result.jobs.length, 0);
});
test("anonymous state excludes private orders, users and operational data", async () => {
  const result = await state(db, null);
  assert.equal(result.orders.length, 0);
  assert.equal(result.notifications.length, 0);
  assert.equal(result.audit.length, 0);
  assert.equal(result.sellers.length, 0);
});
test("password verification, role checks and origin validation fail closed", () => {
  const hash = hashPassword("a-long-test-password");
  assert.equal(verifyPassword("a-long-test-password", hash), true);
  assert.equal(verifyPassword("incorrect-password", hash), false);
  assert.throws(() => requireRole(customer, "admin"));
  assert.throws(() => requireRole(null));
  assert.throws(() =>
    sameOrigin(
      new Request("http://localhost:3000/api/checkout", {
        headers: { origin: "https://attacker.example" },
      }),
    ),
  );
  assert.throws(() =>
    sameOrigin(new Request("http://localhost:3000/api/checkout")),
  );
  sameOrigin(
    new Request("http://localhost:3000/api/checkout", {
      headers: { origin: "http://localhost:3000" },
    }),
  );
});
test("OAuth HMAC and shop validation reject altered callbacks and foreign hosts", () => {
  const p = new URLSearchParams({
    code: "abc",
    shop: "demo.myshopify.com",
    state: "random",
    timestamp: String(Math.floor(Date.now() / 1000)),
  });
  const message = [...p]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  p.set("hmac", createHmac("sha256", "secret").update(message).digest("hex"));
  assert.equal(verifyOAuth(p, "secret"), true);
  p.set("shop", "attacker.example");
  assert.equal(verifyOAuth(p, "secret"), false);
  assert.equal(validShop("demo.myshopify.com.evil.example"), false);
  assert.equal(validShop("demo.myshopify.com"), true);
});
test("tokens are encrypted with authentication and cannot be altered", () => {
  process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
  const encrypted = encryptToken("shpat_test_token");
  assert.ok(!encrypted.includes("shpat_test_token"));
  assert.equal(decryptToken(encrypted), "shpat_test_token");
  const parts = encrypted.split(".");
  parts[1] = "0".repeat(32);
  assert.throws(() => decryptToken(parts.join(".")));
});
test("GraphQL client surfaces API errors rather than reporting successful sync", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ errors: [{ message: "Throttled" }] }), {
        status: 200,
      });
    await assert.rejects(
      () => graphql("demo.myshopify.com", "token", "{shop{id}}"),
      /Throttled/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("concurrent Shopify token refreshes persist one encrypted replacement pair", async () => {
  process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
  process.env.SHOPIFY_CLIENT_ID = "test-client";
  process.env.SHOPIFY_CLIENT_SECRET = "test-secret";
  await db.query(
    "UPDATE shops SET status='connected',token_encrypted=$1,refresh_token_encrypted=$2,token_expires_at=now()-interval '1 minute',refresh_expires_at=now()+interval '80 days' WHERE id='demo-shop'",
    [encryptToken("expired"), encryptToken("old-refresh")],
  );
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (_url, options) => {
      calls++;
      const body = JSON.parse(String(options?.body));
      assert.equal(body.grant_type, "refresh_token");
      assert.equal(body.refresh_token, "old-refresh");
      return new Response(
        JSON.stringify({
          access_token: "fresh",
          refresh_token: "new-refresh",
          expires_in: 3600,
          refresh_token_expires_in: 7776000,
        }),
        { status: 200 },
      );
    };
    const [a, b] = await Promise.all([
      shopConnection(db, "demo-shop"),
      shopConnection(db, "demo-shop"),
    ]);
    assert.equal(a.token, "fresh");
    assert.equal(b.token, "fresh");
    assert.equal(calls, 1);
    const row = (
      await db.query<{
        token_encrypted: string;
        refresh_token_encrypted: string;
      }>(
        "SELECT token_encrypted,refresh_token_encrypted FROM shops WHERE id='demo-shop'",
      )
    ).rows[0];
    assert.equal(decryptToken(row.refresh_token_encrypted), "new-refresh");
    assert.ok(!row.token_encrypted.includes("fresh"));
  } finally {
    globalThis.fetch = original;
  }
});
test("inventory API retry uses the identical idempotency key and immutable delta", async () => {
  const id = randomUUID();
  await db.query(
    "INSERT INTO outbox(id,kind,payload) VALUES($1,'inventory.adjust',$2::jsonb)",
    [
      id,
      JSON.stringify({
        shop_id: "demo-shop",
        inventory_item_id: "gid://shopify/InventoryItem/1001",
        location_id: "gid://shopify/Location/1",
        delta: -2,
        reference: "test",
        productId: "linen-shirt",
      }),
    ],
  );
  const original = globalThis.fetch;
  const bodies: any[] = [];
  try {
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      bodies.push(body);
      if (bodies.length === 1)
        throw new Error("Simulated lost network response");
      return new Response(
        JSON.stringify({
          data: { inventoryAdjustQuantities: { userErrors: [] } },
        }),
        { status: 200 },
      );
    };
    await assert.rejects(() => processOutbox(db, id));
    await processOutbox(db, id);
    await processOutbox(db, id);
    assert.equal(bodies.length, 2);
    assert.deepEqual(bodies[0], bodies[1]);
    assert.equal(bodies[0].variables.key, id);
    assert.equal(bodies[0].variables.input.changes[0].delta, -2);
    assert.match(bodies[0].query, /@idempotent/);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM outbox WHERE id=$1",
          [id],
        )
      ).rows[0].status,
      "completed",
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("old ambiguous inventory jobs require reconciliation instead of reapplying stock", async () => {
  const id = randomUUID();
  await db.query(
    "INSERT INTO outbox(id,kind,payload,created_at) VALUES($1,'inventory.adjust',$2::jsonb,now()-interval '25 hours')",
    [id, JSON.stringify({ shop_id: "demo-shop", delta: -1 })],
  );
  let calls = 0;
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      calls++;
      throw new Error("Must not call Shopify");
    };
    await assert.rejects(() => processOutbox(db, id), /older than 23 hours/);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test("catalogue export is a draft, initializes stock through the outbox, and cannot duplicate a mapping", async () => {
  const original = globalThis.fetch;
  const calls: any[] = [];
  try {
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      calls.push(body);
      return new Response(
        JSON.stringify({
          data: body.query.includes("productByIdentifier")
            ? { productByIdentifier: null }
            : {
                productSet: {
                  product: {
                    id: "gid://shopify/Product/700",
                    variants: {
                      nodes: [
                        {
                          id: "gid://shopify/ProductVariant/701",
                          inventoryItem: {
                            id: "gid://shopify/InventoryItem/702",
                          },
                        },
                      ],
                    },
                  },
                  userErrors: [],
                },
              },
        }),
        { status: 200 },
      );
    };
    const initial = await count("outbox");
    await exportDraft(db, "demo-shop", "canvas-tote", "demo-admin");
    assert.equal(calls[1].variables.input.status, "DRAFT");
    assert.equal(
      calls[1].variables.input.variants[0].inventoryQuantities[0].quantity,
      0,
    );
    assert.equal(await count("outbox"), initial + 1);
    await assert.rejects(
      () => exportDraft(db, "demo-shop", "canvas-tote", "demo-admin"),
      /already connected/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("product sync pushes newest approved price without overwriting inventory", async () => {
  const id = randomUUID();
  await db.query(
    "INSERT INTO outbox(id,kind,payload) VALUES($1,'product.sync',$2::jsonb)",
    [id, JSON.stringify({ productId: "canvas-tote", shop_id: "demo-shop" })],
  );
  await db.query("UPDATE products SET price_cents=4800 WHERE id='canvas-tote'");
  const original = globalThis.fetch;
  const calls: any[] = [];
  try {
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      calls.push(body);
      return new Response(
        JSON.stringify({
          data: body.query.includes("productVariantsBulkUpdate")
            ? { productVariantsBulkUpdate: { userErrors: [] } }
            : { productUpdate: { userErrors: [] } },
        }),
        { status: 200 },
      );
    };
    await processProductSync(db, id);
    assert.equal(calls[1].variables.variants[0].price, "48.00");
    assert.equal(JSON.stringify(calls).includes("inventoryQuantities"), false);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM outbox WHERE id=$1",
          [id],
        )
      ).rows[0].status,
      "completed",
    );
  } finally {
    globalThis.fetch = original;
  }
});
