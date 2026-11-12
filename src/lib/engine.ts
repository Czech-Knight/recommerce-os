import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import type { Database } from "./db";
import type { Product, User } from "./types";
import { AppError } from "./auth";
import { isDemo } from "./config";

export const checkoutSchema = z.object({
  key: z.string().uuid(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1).max(100),
        quantity: z.number().int().min(1).max(25),
      }),
    )
    .min(1)
    .max(50),
  name: z.string().trim().min(2).max(100),
  address: z.string().trim().min(8).max(500),
  discount: z.string().trim().max(40).default(""),
});
export async function audit(
  tx: Database,
  actor: string | null,
  action: string,
  entity: string,
  detail: string,
) {
  await tx.query(
    "INSERT INTO audit_logs(id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), actor, action, entity, detail],
  );
}
export async function notify(tx: Database, userId: string, message: string) {
  await tx.query(
    "INSERT INTO notifications(id,user_id,message) VALUES($1,$2,$3)",
    [randomUUID(), userId, message],
  );
}
export async function queueDelta(
  tx: Database,
  productId: string,
  delta: number,
  reference: string,
  excludeShop?: string,
) {
  const links = await tx.query<{
    shop_id: string;
    inventory_item_id: string;
    location_id: string;
    status: string;
  }>(
    `SELECT l.shop_id,l.inventory_item_id,s.location_id,s.status
    FROM product_links l JOIN shops s ON s.id=l.shop_id WHERE l.product_id=$1 AND s.status IN ('connected','demo')`,
    [productId],
  );
  for (const link of links.rows) {
    if (link.shop_id === excludeShop) continue;
    await tx.query(
      "INSERT INTO outbox(id,kind,payload,status,error,completed_at) VALUES($1,'inventory.adjust',$2::jsonb,$3,$4,$5)",
      [
        randomUUID(),
        JSON.stringify({ ...link, delta, productId, reference }),
        link.status === "demo" ? "completed" : "pending",
        link.status === "demo"
          ? "Demo only: no Shopify request was sent."
          : null,
        link.status === "demo" ? new Date() : null,
      ],
    );
  }
}
export async function changeStock(
  tx: Database,
  productId: string,
  delta: number,
  eventKey: string,
  reason: string,
  orderId: string | null,
  excludeShop?: string,
) {
  const r = await tx.query<{ stock: number }>(
    "UPDATE products SET stock=stock+$1,updated_at=now() WHERE id=$2 AND stock+$1>=0 RETURNING stock",
    [delta, productId],
  );
  if (!r.rows.length)
    throw new AppError(
      "Insufficient stock. Refresh your cart and try again.",
      409,
    );
  await tx.query(
    "INSERT INTO inventory_movements(id,product_id,order_id,delta,reason,event_key) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(), productId, orderId, delta, reason, eventKey],
  );
  await queueDelta(tx, productId, delta, eventKey, excludeShop);
}
export async function checkout(db: Database, user: User, raw: unknown) {
  const input = checkoutSchema.parse(raw);
  const quantities = new Map<string, number>();
  for (const item of input.items)
    quantities.set(
      item.productId,
      (quantities.get(item.productId) || 0) + item.quantity,
    );
  if ([...quantities.values()].some((n) => n > 25))
    throw new AppError("Maximum 25 units of each item.");
  const ids = [...quantities.keys()].sort();
  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({
        items: ids.map((id) => [id, quantities.get(id)]),
        name: input.name,
        address: input.address,
        discount: input.discount.toUpperCase(),
      }),
    )
    .digest("hex");
  return db.transaction(async (tx) => {
    // Serialize this customer's checkout attempts, including concurrent retries.
    await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user.id]);
    const existing = await tx.query<{ id: string; request_hash: string }>(
      "SELECT id,request_hash FROM orders WHERE source='marketplace' AND external_id=$1",
      [`${user.id}:${input.key}`],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].request_hash !== requestHash)
        throw new AppError(
          "This checkout key belongs to a different cart.",
          409,
        );
      return { id: existing.rows[0].id, duplicate: true };
    }
    const products = await tx.query<Product>(
      `SELECT p.* FROM products p JOIN users u ON u.id=p.seller_id
      WHERE p.id=ANY($1::text[]) AND p.status='active' AND u.status='active' ORDER BY p.id FOR UPDATE OF p`,
      [ids],
    );
    if (products.rows.length !== ids.length)
      throw new AppError("An item is no longer available.", 409);
    let total = 0;
    for (const p of products.rows) {
      const qty = quantities.get(p.id)!;
      if (p.stock < qty)
        throw new AppError(`${p.title} has only ${p.stock} left.`, 409);
      total += p.price_cents * qty;
    }
    let discount = 0;
    if (input.discount) {
      const found = await tx.query<{ percent: number }>(
        "SELECT percent FROM discounts WHERE code=$1 AND active=true",
        [input.discount.toUpperCase()],
      );
      if (!found.rows[0])
        throw new AppError("Discount code is invalid or inactive.");
      discount = Math.floor((total * found.rows[0].percent) / 100);
    }
    const id = randomUUID();
    await tx.query(
      `INSERT INTO orders(id,customer_id,source,external_id,request_hash,status,total_cents,discount_cents,customer_name,address)
      VALUES($1,$2,'marketplace',$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        user.id,
        `${user.id}:${input.key}`,
        requestHash,
        isDemo() ? "paid" : "awaiting_payment",
        total - discount,
        discount,
        input.name,
        input.address,
      ],
    );
    for (const p of products.rows) {
      const qty = quantities.get(p.id)!;
      await tx.query(
        "INSERT INTO order_items(id,order_id,product_id,seller_id,title,quantity,price_cents) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [randomUUID(), id, p.id, p.seller_id, p.title, qty, p.price_cents],
      );
      await changeStock(
        tx,
        p.id,
        -qty,
        `order:${id}:${p.id}`,
        "marketplace order",
        id,
      );
    }
    for (const seller of new Set(products.rows.map((p) => p.seller_id)))
      await notify(
        tx,
        seller,
        `New marketplace order ${id.slice(0, 8)}. ${isDemo() ? "Demo payment recorded." : "Awaiting manual payment confirmation."}`,
      );
    await audit(
      tx,
      user.id,
      "order.created",
      id,
      `Marketplace order placed with ${ids.length} line items.`,
    );
    return { id, duplicate: false };
  });
}

const shopifyOrderSchema = z.object({
  id: z.union([z.string(), z.number().int().safe()]).transform(String),
  currency: z.literal("AUD"),
  financial_status: z.string().default("pending"),
  line_items: z
    .array(
      z.object({
        variant_id: z
          .union([z.string(), z.number().int().safe(), z.null()])
          .transform((v) => (v === null ? "" : String(v))),
        quantity: z.number().int().positive(),
        price: z.string().regex(/^\d+(\.\d{1,2})?$/),
      }),
    )
    .min(1),
});
export async function acceptWebhook(
  db: Database,
  shopId: string,
  eventId: string,
  topic: string,
  payload: unknown,
) {
  const id = randomUUID();
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO webhook_events(id,shop_id,event_id,topic,payload) VALUES($1,$2,$3,$4,$5::jsonb)
    ON CONFLICT(shop_id,topic,event_id) DO NOTHING RETURNING id`,
    [id, shopId, eventId, topic, JSON.stringify(payload)],
  );
  if (inserted.rows[0]) return { id, duplicate: false };
  const existing = await db.query<{ id: string }>(
    "SELECT id FROM webhook_events WHERE shop_id=$1 AND topic=$2 AND event_id=$3",
    [shopId, topic, eventId],
  );
  return { id: existing.rows[0].id, duplicate: true };
}
export async function processWebhook(db: Database, eventId: string) {
  try {
    return await db.transaction(async (tx) => {
      const event = (
        await tx.query<{
          id: string;
          shop_id: string;
          topic: string;
          payload: unknown;
          status: string;
        }>("SELECT * FROM webhook_events WHERE id=$1 FOR UPDATE", [eventId])
      ).rows[0];
      if (!event) throw new AppError("Webhook not found.", 404);
      if (event.status === "completed") return { duplicate: true };
      // Lock the shop so different deliveries for the same external order serialize.
      await tx.query("SELECT id FROM shops WHERE id=$1 FOR UPDATE", [
        event.shop_id,
      ]);
      if (event.topic === "app/uninstalled") {
        await tx.query(
          "UPDATE shops SET status='disconnected',token_encrypted=NULL,refresh_token_encrypted=NULL,token_expires_at=NULL,refresh_expires_at=NULL WHERE id=$1",
          [event.shop_id],
        );
      } else if (
        event.topic === "orders/create" ||
        event.topic === "orders/paid"
      ) {
        const order = shopifyOrderSchema.parse(event.payload);
        const source = `shopify:${event.shop_id}`;
        const existing = (
          await tx.query<{ id: string }>(
            "SELECT id FROM orders WHERE source=$1 AND external_id=$2",
            [source, order.id],
          )
        ).rows[0];
        if (existing) {
          if (event.topic === "orders/paid")
            await tx.query(
              "UPDATE orders SET status='paid' WHERE id=$1 AND status='awaiting_payment'",
              [existing.id],
            );
        } else {
          const quantities = new Map<
            string,
            { quantity: number; price: number }
          >();
          for (const item of order.line_items) {
            const old = quantities.get(item.variant_id);
            quantities.set(item.variant_id, {
              quantity: (old?.quantity || 0) + item.quantity,
              price: Math.round(Number(item.price) * 100),
            });
          }
          const linked = await tx.query<Product & { variant_id: string }>(
            `SELECT p.*,l.variant_id FROM product_links l JOIN products p ON p.id=l.product_id
            WHERE l.shop_id=$1 AND l.variant_id=ANY($2::text[]) ORDER BY p.id FOR UPDATE OF p`,
            [event.shop_id, [...quantities.keys()]],
          );
          // An unrelated Shopify item is outside this marketplace; only mapped lines belong to our sellers.
          if (linked.rows.length) {
            const id = randomUUID();
            const total = linked.rows.reduce(
              (s, p) =>
                s +
                quantities.get(p.variant_id)!.price *
                  quantities.get(p.variant_id)!.quantity,
              0,
            );
            await tx.query(
              "INSERT INTO orders(id,source,external_id,status,total_cents,customer_name) VALUES($1,$2,$3,$4,$5,$6)",
              [
                id,
                source,
                order.id,
                order.financial_status === "paid" ||
                event.topic === "orders/paid"
                  ? "paid"
                  : "awaiting_payment",
                total,
                "Shopify customer",
              ],
            );
            for (const p of linked.rows) {
              const line = quantities.get(p.variant_id)!;
              await tx.query(
                "INSERT INTO order_items(id,order_id,product_id,seller_id,title,quantity,price_cents) VALUES($1,$2,$3,$4,$5,$6,$7)",
                [
                  randomUUID(),
                  id,
                  p.id,
                  p.seller_id,
                  p.title,
                  line.quantity,
                  line.price,
                ],
              );
              // Shopify already deducted its own inventory. Never echo that decrement back to the source shop.
              await changeStock(
                tx,
                p.id,
                -line.quantity,
                `order:${id}:${p.id}`,
                "Shopify order",
                id,
                event.shop_id,
              );
            }
            for (const seller of new Set(linked.rows.map((p) => p.seller_id)))
              await notify(
                tx,
                seller,
                `Shopify order #${order.id} received. Inventory updated.`,
              );
            await audit(
              tx,
              null,
              "shopify.order.processed",
              id,
              `Shopify order ${order.id}: ${linked.rows.length} mapped items processed once.`,
            );
          }
        }
      } else throw new AppError("Unsupported webhook topic.");
      await tx.query(
        "UPDATE webhook_events SET status='completed',error=NULL,processed_at=now(),attempts=attempts+1 WHERE id=$1",
        [eventId],
      );
      return { duplicate: false };
    });
  } catch (error) {
    await db.query(
      "UPDATE webhook_events SET status='failed',attempts=attempts+1,error=$2 WHERE id=$1",
      [
        eventId,
        error instanceof AppError
          ? error.message
          : "Processing failed. Check worker logs and mappings before retrying.",
      ],
    );
    throw error;
  }
}
export async function restoreOrder(
  tx: Database,
  orderId: string,
  reason: string,
  actor: string,
) {
  const order = (
    await tx.query<{ status: string; source: string }>(
      "SELECT status,source FROM orders WHERE id=$1 FOR UPDATE",
      [orderId],
    )
  ).rows[0];
  if (!order) throw new AppError("Order not found.", 404);
  if (order.source !== "marketplace")
    throw new AppError("Manage Shopify cancellations and refunds in Shopify.");
  if (["cancelled", "returned"].includes(order.status)) return;
  const items = await tx.query<{ product_id: string; quantity: number }>(
    "SELECT product_id,quantity FROM order_items WHERE order_id=$1 ORDER BY product_id",
    [orderId],
  );
  for (const item of items.rows)
    await changeStock(
      tx,
      item.product_id,
      item.quantity,
      `restore:${orderId}:${item.product_id}`,
      reason,
      orderId,
    );
  const status = reason === "return approved" ? "returned" : "cancelled";
  await tx.query("UPDATE orders SET status=$2 WHERE id=$1", [orderId, status]);
  await tx.query("UPDATE order_items SET status=$2 WHERE order_id=$1", [
    orderId,
    status,
  ]);
  await audit(tx, actor, `order.${status}`, orderId, reason);
}
