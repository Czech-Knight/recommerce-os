import { exportDraft, queueProductSync } from "@/lib/catalog";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z, ZodError } from "zod";
import { getDb } from "@/lib/db";
import {
  currentUser,
  requireRole,
  newSession,
  hashPassword,
  verifyPassword,
  AppError,
  sameOrigin,
  digest,
} from "@/lib/auth";
import {
  acceptWebhook,
  processWebhook,
  checkout,
  audit,
  changeStock,
  notify,
  restoreOrder,
} from "@/lib/engine";
import { isDemo, appUrl, required } from "@/lib/config";
import { state } from "@/lib/state";
import {
  verifyWebhook,
  verifyOAuth,
  validShop,
  encryptToken,
  graphql,
  importCatalog,
  shopConnection,
} from "@/lib/shopify";
import type { Product, User } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
const productSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(3000),
  brand: z.string().trim().max(80),
  category: z.enum([
    "Tops",
    "Bottoms",
    "Outerwear",
    "Knitwear",
    "Dresses",
    "Accessories",
  ]),
  condition: z.enum(["New with tags", "Like new", "Excellent", "Good"]),
  size: z.string().trim().min(1).max(40),
  sku: z.string().trim().min(1).max(80),
  price_cents: z.number().int().min(1).max(10000000),
  stock: z.number().int().min(0).max(100000),
  image_url: z
    .string()
    .max(2000)
    .refine(
      (s) =>
        /^\/products\/[a-z]+\.svg$/.test(s) ||
        /^\/api\/media\/[a-f0-9-]+\.(png|jpg|webp)$/.test(s) ||
        /^https:\/\//.test(s),
      "Use an uploaded image or an HTTPS image URL.",
    ),
  seller_id: z.string().optional(),
});
async function body(req: NextRequest) {
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 100000)
    throw new AppError("Request is too large.", 413);
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError("Invalid JSON.");
  }
}
async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const path = (await params).path.join("/"),
      db = await getDb();
    if (path === "health") {
      await db.query("SELECT 1");
      return json({ status: "ok", mode: isDemo() ? "demo" : "live" });
    }
    if (path === "shopify/webhooks" && req.method === "POST") {
      if (isDemo())
        throw new AppError(
          "Real Shopify webhooks are disabled in demo mode.",
          409,
        );
      const raw = await req.text();
      if (Buffer.byteLength(raw) > 2000000)
        throw new AppError("Webhook too large.", 413);
      if (
        !verifyWebhook(
          raw,
          req.headers.get("x-shopify-hmac-sha256") || "",
          required("SHOPIFY_CLIENT_SECRET"),
        )
      )
        throw new AppError("Invalid webhook signature.", 401);
      const domain = req.headers.get("x-shopify-shop-domain") || "",
        eventId =
          req.headers.get("x-shopify-event-id") ||
          req.headers.get("x-shopify-webhook-id"),
        topic = req.headers.get("x-shopify-topic");
      if (!validShop(domain) || !eventId || eventId.length > 200 || !topic)
        throw new AppError("Missing webhook headers.");
      if (!["orders/create", "orders/paid", "app/uninstalled"].includes(topic))
        return json({ ignored: true });
      const shop = (
        await db.query<{ id: string }>(
          "SELECT id FROM shops WHERE domain=$1 AND status='connected'",
          [domain],
        )
      ).rows[0];
      if (!shop) throw new AppError("Unknown Shopify store.", 404);
      // Acknowledge only after the inbox is durable; the worker discovers pending rows even if Redis is unavailable.
      const accepted = await acceptWebhook(
        db,
        shop.id,
        eventId,
        topic,
        JSON.parse(raw),
      );
      return json(accepted, 200);
    }
    if (path.startsWith("media/") && req.method === "GET") {
      const file = path.slice(6);
      if (!/^[a-f0-9-]+\.(png|jpg|webp)$/.test(file))
        throw new AppError("Image not found.", 404);
      try {
        const data = await readFile(resolve(".data/uploads", file));
        return new NextResponse(data, {
          headers: {
            "Content-Type": file.endsWith(".jpg")
              ? "image/jpeg"
              : file.endsWith(".png")
                ? "image/png"
                : "image/webp",
            "Cache-Control": "public, max-age=86400",
          },
        });
      } catch {
        throw new AppError("Image not found.", 404);
      }
    }
    const user = await currentUser(db);
    if (req.method === "GET") {
      if (path === "state") return json(await state(db, user));
      if (path === "shopify/callback") {
        if (isDemo())
          throw new AppError("Use live mode to connect a real store.");
        const actor = requireRole(user, "admin", "merchant"),
          q = req.nextUrl.searchParams;
        const shop = q.get("shop") || "",
          nonce = q.get("state") || "",
          code = q.get("code");
        if (
          !validShop(shop) ||
          !code ||
          !verifyOAuth(q, required("SHOPIFY_CLIENT_SECRET"))
        )
          throw new AppError("Invalid Shopify OAuth callback.", 403);
        const consumed = await db.query(
          `DELETE FROM oauth_states WHERE state_hash=$1 AND user_id=$2 AND shop=$3 AND expires_at>now() RETURNING user_id`,
          [digest(nonce), actor.id, shop],
        );
        if (!consumed.rows.length)
          throw new AppError(
            "The Shopify connection request expired. Please try again.",
            403,
          );
        const response = await fetch(
          `https://${shop}/admin/oauth/access_token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id: required("SHOPIFY_CLIENT_ID"),
              client_secret: required("SHOPIFY_CLIENT_SECRET"),
              code,
              expiring: 1,
            }),
            signal: AbortSignal.timeout(15000),
          },
        );
        if (!response.ok)
          throw new AppError("Shopify token exchange failed.", 502);
        const token = (await response.json()) as {
          access_token: string;
          scope: string;
          expires_in: number;
          refresh_token: string;
          refresh_token_expires_in: number;
        };
        if (!token.access_token)
          throw new AppError("Shopify returned no access token.", 502);
        if (
          !token.refresh_token ||
          !token.expires_in ||
          !token.refresh_token_expires_in
        )
          throw new AppError(
            "Shopify did not return an expiring offline token pair.",
            502,
          );
        const info = await graphql<{ shop: { currencyCode: string } }>(
          shop,
          token.access_token,
          "{shop{currencyCode}}",
        );
        if (info.shop.currencyCode !== "AUD")
          throw new AppError(
            "This workspace currently supports AUD stores only.",
          );
        await db.query(
          `INSERT INTO shops(id,domain,owner_id,token_encrypted,scopes,refresh_token_encrypted,token_expires_at,refresh_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(domain) DO UPDATE SET token_encrypted=EXCLUDED.token_encrypted,scopes=EXCLUDED.scopes,refresh_token_encrypted=EXCLUDED.refresh_token_encrypted,token_expires_at=EXCLUDED.token_expires_at,refresh_expires_at=EXCLUDED.refresh_expires_at,status='connected'`,
          [
            randomUUID(),
            shop,
            actor.id,
            encryptToken(token.access_token),
            token.scope,
            encryptToken(token.refresh_token),
            new Date(Date.now() + token.expires_in * 1000),
            new Date(Date.now() + token.refresh_token_expires_in * 1000),
          ],
        );
        await audit(
          db,
          actor.id,
          "shopify.connected",
          shop,
          "Shopify store authenticated.",
        );
        return NextResponse.redirect(
          new URL("/integrations?connected=1", appUrl()),
        );
      }
      if (path === "shopify/locations") {
        requireRole(user, "admin", "merchant");
        const shop = await shopConnection(
          db,
          req.nextUrl.searchParams.get("shopId") || "",
        );
        return json(
          await graphql(
            shop.domain,
            shop.token,
            "{locations(first:50){nodes{id name isActive}}}",
          ),
        );
      }
      throw new AppError("Endpoint not found.", 404);
    }
    sameOrigin(req);
    if (path === "upload") {
      requireRole(user, "admin", "merchant", "seller");
      if (Number(req.headers.get("content-length")) > 5500000)
        throw new AppError("Maximum image size is 5 MB.", 413);
      const form = await req.formData(),
        file = form.get("file");
      if (!(file instanceof File) || file.size > 5000000)
        throw new AppError("Choose a PNG, JPEG or WebP under 5 MB.");
      const bytes = Buffer.from(await file.arrayBuffer());
      const ext = bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "png"
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          ? "jpg"
          : bytes.toString("ascii", 0, 4) === "RIFF" &&
              bytes.toString("ascii", 8, 12) === "WEBP"
            ? "webp"
            : null;
      if (!ext)
        throw new AppError("Only PNG, JPEG and WebP images are supported.");
      const name = `${randomUUID()}.${ext}`;
      if (process.env.S3_BUCKET) {
        const { S3Client, PutObjectCommand } =
          await import("@aws-sdk/client-s3");
        await new S3Client({ region: required("AWS_REGION") }).send(
          new PutObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: `products/${name}`,
            Body: bytes,
            ContentType: ext === "jpg" ? "image/jpeg" : `image/${ext}`,
          }),
        );
        return json({
          url: `${required("S3_PUBLIC_BASE_URL").replace(/\/$/, "")}/products/${name}`,
        });
      }
      await mkdir(resolve(".data/uploads"), { recursive: true });
      await writeFile(resolve(".data/uploads", name), bytes);
      return json({ url: `/api/media/${name}` });
    }
    const input = await body(req);
    if (path === "auth/demo") {
      if (!isDemo()) throw new AppError("Demo access is disabled.", 403);
      const role = z
        .enum(["admin", "merchant", "seller", "customer"])
        .parse(input.role);
      await newSession(db, `demo-${role}`);
      return json({ ok: true });
    }
    if (path === "auth/logout") {
      const c = await cookies(),
        token = c.get("rc_session")?.value;
      if (token)
        await db.query("DELETE FROM sessions WHERE token_hash=$1", [
          digest(token),
        ]);
      c.delete("rc_session");
      return json({ ok: true });
    }
    if (path === "auth/login" || path === "auth/register") {
      const data = z
        .object({
          email: z
            .email()
            .max(200)
            .transform((s) => s.toLowerCase()),
          password: z.string().min(12).max(128),
          name: z.string().trim().min(2).max(80).optional(),
          role: z.enum(["customer", "seller"]).default("customer"),
        })
        .parse(input);
      await db.query(
        `INSERT INTO auth_attempts(email,attempts) VALUES($1,1) ON CONFLICT(email) DO UPDATE SET
      attempts=CASE WHEN auth_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE auth_attempts.attempts+1 END,
      window_start=CASE WHEN auth_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE auth_attempts.window_start END`,
        [data.email],
      );
      const attempt = (
        await db.query<{ attempts: number }>(
          "SELECT attempts FROM auth_attempts WHERE email=$1",
          [data.email],
        )
      ).rows[0];
      if (attempt.attempts > 10)
        throw new AppError("Too many attempts. Try again in 15 minutes.", 429);
      let id: string;
      if (path === "auth/register") {
        if (!data.name) throw new AppError("Name is required.");
        id = randomUUID();
        await db.query(
          "INSERT INTO users(id,name,email,password_hash,role,status) VALUES($1,$2,$3,$4,$5,$6)",
          [
            id,
            data.name,
            data.email,
            hashPassword(data.password),
            data.role,
            data.role === "seller" ? "pending" : "active",
          ],
        );
      } else {
        const match = (
          await db.query<User & { password_hash: string }>(
            "SELECT * FROM users WHERE email=$1",
            [data.email],
          )
        ).rows[0];
        if (
          !match?.password_hash ||
          !verifyPassword(data.password, match.password_hash) ||
          match.status === "suspended"
        )
          throw new AppError("Email or password is incorrect.", 401);
        id = match.id;
      }
      await newSession(db, id);
      return json({ ok: true });
    }
    if (path === "checkout")
      return json(await checkout(db, requireRole(user), input));
    if (path === "products") {
      const actor = requireRole(user, "admin", "merchant", "seller"),
        data = productSchema.parse(input),
        id = randomUUID();
      const sellerId =
        actor.role === "seller" ? actor.id : data.seller_id || actor.id;
      const seller = (
        await db.query<User>("SELECT id,role,status FROM users WHERE id=$1", [
          sellerId,
        ])
      ).rows[0];
      if (!seller || !["seller", "admin", "merchant"].includes(seller.role))
        throw new AppError("Invalid seller.");
      await db.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO products(id,seller_id,title,description,brand,category,condition,size,sku,price_cents,stock,image_url,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            id,
            sellerId,
            data.title,
            data.description,
            data.brand,
            data.category,
            data.condition,
            data.size,
            data.sku,
            data.price_cents,
            data.stock,
            data.image_url,
            actor.role === "seller" ? "pending" : "active",
          ],
        );
        await audit(tx, actor.id, "product.created", id, data.title);
      });
      return json({ id }, 201);
    }
    if (path.startsWith("products/")) {
      const actor = requireRole(user, "admin", "merchant", "seller"),
        id = path.slice(9);
      await db.transaction(async (tx) => {
        const p = (
          await tx.query<Product>(
            "SELECT * FROM products WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (!p) throw new AppError("Product not found.", 404);
        if (actor.role === "seller" && p.seller_id !== actor.id)
          throw new AppError("This listing belongs to another seller.", 403);
        if (input.action === "approve") {
          requireRole(actor, "admin", "merchant");
          await tx.query("UPDATE products SET status='active' WHERE id=$1", [
            id,
          ]);
        } else if (input.action === "archive")
          await tx.query("UPDATE products SET status='archived' WHERE id=$1", [
            id,
          ]);
        else {
          const data = productSchema.parse({
            ...p,
            ...input,
            seller_id: p.seller_id,
          });
          const delta = data.stock - p.stock;
          if (delta)
            await changeStock(
              tx,
              id,
              delta,
              `adjust:${randomUUID()}`,
              "manual stock adjustment",
              null,
            );
          await tx.query(
            `UPDATE products SET title=$2,description=$3,brand=$4,category=$5,condition=$6,size=$7,price_cents=$8,image_url=$9,updated_at=now(),status=$10 WHERE id=$1`,
            [
              id,
              data.title,
              data.description,
              data.brand,
              data.category,
              data.condition,
              data.size,
              data.price_cents,
              data.image_url,
              actor.role === "seller" ? "pending" : p.status,
            ],
          );
        }
        if (actor.role !== "seller" || input.action === "archive")
          await queueProductSync(tx, id);
        await audit(
          tx,
          actor.id,
          `product.${input.action || "updated"}`,
          id,
          p.title,
        );
      });
      return json({ ok: true });
    }
    if (path.startsWith("orders/")) {
      const actor = requireRole(user),
        id = path.slice(7);
      await db.transaction(async (tx) => {
        const order = (
          await tx.query<{
            id: string;
            status: string;
            source: string;
            customer_id: string;
          }>("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [id])
        ).rows[0];
        if (!order) throw new AppError("Order not found.", 404);
        if (input.action === "return") {
          if (order.customer_id !== actor.id)
            throw new AppError("This order does not belong to you.", 403);
          if (
            order.source !== "marketplace" ||
            !["paid", "shipped"].includes(order.status)
          )
            throw new AppError(
              "This order is not eligible for a marketplace return.",
            );
          const reason = z
            .string()
            .trim()
            .min(10)
            .max(1000)
            .parse(input.reason);
          await tx.query(
            "INSERT INTO returns(id,order_id,customer_id,reason) VALUES($1,$2,$3,$4)",
            [randomUUID(), id, actor.id, reason],
          );
        } else if (input.action === "cancel") {
          requireRole(actor, "admin", "merchant");
          if (order.status !== "awaiting_payment")
            throw new AppError("Only unpaid orders can be cancelled here.");
          await restoreOrder(tx, id, "unpaid order cancelled", actor.id);
        } else if (input.action === "paid") {
          requireRole(actor, "admin", "merchant");
          if (
            order.source !== "marketplace" ||
            order.status !== "awaiting_payment"
          )
            throw new AppError("This order cannot be marked paid.");
          await tx.query("UPDATE orders SET status='paid' WHERE id=$1", [id]);
        } else if (input.action === "ship") {
          requireRole(actor, "admin", "merchant", "seller");
          if (!["paid", "processing"].includes(order.status))
            throw new AppError("Only paid orders can be shipped.");
          const updated = await tx.query(
            "UPDATE order_items SET status='shipped' WHERE order_id=$1 AND ($2::boolean OR seller_id=$3) AND status='processing' RETURNING id",
            [id, actor.role !== "seller", actor.id],
          );
          if (!updated.rows.length)
            throw new AppError("No items are available to ship.", 403);
          const pending = await tx.query(
            "SELECT id FROM order_items WHERE order_id=$1 AND status<>'shipped'",
            [id],
          );
          await tx.query("UPDATE orders SET status=$2 WHERE id=$1", [
            id,
            pending.rows.length ? "processing" : "shipped",
          ]);
        } else throw new AppError("Unknown order action.");
        await audit(
          tx,
          actor.id,
          `order.${input.action}`,
          id,
          "Order action recorded.",
        );
      });
      return json({ ok: true });
    }
    if (path === "notifications/read") {
      const actor = requireRole(user);
      await db.query(
        "UPDATE notifications SET read_at=now() WHERE user_id=$1",
        [actor.id],
      );
      return json({ ok: true });
    }
    if (path === "users/update") {
      const actor = requireRole(user, "admin"),
        data = z
          .object({
            id: z.string(),
            status: z.enum(["active", "suspended"]),
            role: z.enum(["customer", "seller", "merchant"]).optional(),
          })
          .parse(input);
      if (data.id === actor.id)
        throw new AppError("You cannot change your own access here.");
      await db.transaction(async (tx) => {
        const changed = await tx.query(
          "UPDATE users SET status=$2,role=COALESCE($3,role) WHERE id=$1 AND role<>'admin' RETURNING id",
          [data.id, data.status, data.role || null],
        );
        if (!changed.rows.length)
          throw new AppError("User not found or protected.", 404);
        await audit(
          tx,
          actor.id,
          "user.updated",
          data.id,
          `Access changed to ${data.status}.`,
        );
      });
      return json({ ok: true });
    }
    if (path === "returns/review") {
      const actor = requireRole(user, "admin", "merchant"),
        data = z
          .object({ id: z.string(), status: z.enum(["approved", "rejected"]) })
          .parse(input);
      await db.transaction(async (tx) => {
        const r = (
          await tx.query<{
            order_id: string;
            status: string;
            customer_id: string;
          }>("SELECT * FROM returns WHERE id=$1 FOR UPDATE", [data.id])
        ).rows[0];
        if (!r || r.status !== "requested")
          throw new AppError("Return has already been reviewed.", 409);
        if (data.status === "approved")
          await restoreOrder(tx, r.order_id, "return approved", actor.id);
        await tx.query("UPDATE returns SET status=$2 WHERE id=$1", [
          data.id,
          data.status,
        ]);
        await notify(
          tx,
          r.customer_id,
          `Return ${data.status} for order ${r.order_id.slice(0, 8)}. ${data.status === "approved" ? "Any payment refund must be arranged separately." : ""}`,
        );
        await audit(tx, actor.id, "return.reviewed", data.id, data.status);
      });
      return json({ ok: true });
    }
    if (path === "discounts") {
      const actor = requireRole(user, "admin", "merchant"),
        data = z
          .object({
            code: z.string().regex(/^[A-Z0-9_-]{3,30}$/),
            percent: z.number().int().min(1).max(80),
            active: z.boolean().default(true),
          })
          .parse(input);
      await db.query(
        "INSERT INTO discounts(code,percent,active) VALUES($1,$2,$3) ON CONFLICT(code) DO UPDATE SET percent=$2,active=$3",
        [data.code, data.percent, data.active],
      );
      await audit(
        db,
        actor.id,
        "discount.updated",
        data.code,
        `${data.percent}% discount ${data.active ? "enabled" : "disabled"}.`,
      );
      return json({ ok: true });
    }
    if (path === "jobs/retry") {
      requireRole(user, "admin", "merchant");
      const id = z.string().uuid().parse(input.id);
      const r = await db.query(
        "UPDATE webhook_events SET status='pending',attempts=0,error=NULL WHERE id=$1 AND status='failed' RETURNING id",
        [id],
      );
      if (!r.rows.length)
        await db.query(
          "UPDATE outbox SET status='pending',attempts=0,error=NULL WHERE id=$1 AND status='failed'",
          [id],
        );
      if (isDemo() && r.rows.length) await processWebhook(db, id);
      return json({ ok: true });
    }
    if (path === "demo/order") {
      requireRole(user, "admin", "merchant");
      if (!isDemo()) throw new AppError("Demo endpoint is disabled.", 403);
      const external = z
        .string()
        .regex(/^[a-zA-Z0-9-]{1,80}$/)
        .parse(input.orderId);
      const before = (
        await db.query<{ stock: number }>(
          "SELECT stock FROM products WHERE id='linen-shirt'",
        )
      ).rows[0].stock;
      const result = await acceptWebhook(
        db,
        "demo-shop",
        input.replay ? `replay-${external}` : `event-${external}`,
        "orders/create",
        {
          id: external,
          currency: "AUD",
          financial_status: "paid",
          line_items: [{ variant_id: 1001, quantity: 1, price: "59.00" }],
        },
      );
      await processWebhook(db, result.id);
      const after = (
        await db.query<{ stock: number }>(
          "SELECT stock FROM products WHERE id='linen-shirt'",
        )
      ).rows[0].stock;
      return json({
        before,
        after,
        duplicate: before === after,
        orderId: external,
      });
    }
    if (path === "shopify/connect") {
      const actor = requireRole(user, "admin", "merchant");
      if (isDemo())
        throw new AppError(
          "Switch to the PostgreSQL backend to connect a real Shopify store.",
        );
      const shop = z
        .string()
        .refine(validShop, "Use your-store.myshopify.com")
        .parse(input.shop);
      required("TOKEN_ENCRYPTION_KEY");
      const nonce = randomBytes(32).toString("hex");
      await db.query(
        "INSERT INTO oauth_states(state_hash,user_id,shop,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",
        [digest(nonce), actor.id, shop],
      );
      const q = new URLSearchParams({
        client_id: required("SHOPIFY_CLIENT_ID"),
        scope:
          process.env.SHOPIFY_SCOPES ||
          "read_products,write_products,read_inventory,write_inventory,read_orders,read_locations",
        redirect_uri: `${appUrl()}/api/shopify/callback`,
        state: nonce,
      });
      return json({ url: `https://${shop}/admin/oauth/authorize?${q}` });
    }
    if (path === "shopify/export") {
      const actor = requireRole(user, "admin", "merchant");
      const data = z
        .object({ shopId: z.string(), productId: z.string() })
        .parse(input);
      return json(await exportDraft(db, data.shopId, data.productId, actor.id));
    }
    if (path === "shopify/import") {
      requireRole(user, "admin", "merchant");
      const data = z
        .object({
          shopId: z.string(),
          sellerId: z.string(),
          locationId: z.string().regex(/^gid:\/\/shopify\/Location\/\d+$/),
        })
        .parse(input);
      const seller = (
        await db.query(
          "SELECT id FROM users WHERE id=$1 AND role IN ('seller','admin','merchant') AND status='active'",
          [data.sellerId],
        )
      ).rows[0];
      if (!seller) throw new AppError("Choose an active seller.");
      return json(
        await importCatalog(db, data.shopId, data.sellerId, data.locationId),
      );
    }
    throw new AppError("Endpoint not found.", 404);
  } catch (error) {
    if (error instanceof AppError)
      return json({ error: error.message }, error.status);
    if (error instanceof ZodError)
      return json(
        {
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    if ((error as { code?: string }).code === "23505")
      return json(
        { error: "This record already exists. Refresh and try again." },
        409,
      );
    console.error(
      "Request failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return json(
      {
        error:
          "The request could not be completed. Check server configuration and try again.",
      },
      500,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
